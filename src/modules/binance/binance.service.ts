import { Injectable } from '@nestjs/common';
import * as ccxt from 'ccxt';

@Injectable()
export class BinanceService {
  private readonly exchange: ccxt.binance;

  constructor() {
    this.exchange = new ccxt.binance({
      apiKey: process.env.BINANCE_API_KEY || '',
      secret: process.env.BINANCE_API_SECRET || '',
      enableRateLimit: true,
    });
  }

  async fetchOHLCV(
    symbol: string,
    timeframe: string,
    since?: number,
    limit = 100,
  ) {
    return this.exchange.fetchOHLCV(symbol, timeframe, since, limit);
  }

  async getPrice(symbol: string): Promise<number> {
    try {
      const ticker = await this.exchange.fetchTicker(symbol);
      return ticker.last;
    } catch (err) {
      console.error(`Ошибка при получении цены ${symbol}:`, err.message);
      throw err;
    }
  }

  async getOrderBook(symbol: string, depth = 5) {
    try {
      const book = await this.exchange.fetchOrderBook(symbol, depth);
      return {
        bids: book.bids,
        asks: book.asks,
      };
    } catch (err) {
      console.error(`Ошибка при получении стакана ${symbol}:`, err.message);
      throw err;
    }
  }
}
