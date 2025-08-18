import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { MarketProvider } from '../market-provider.interface';
import * as ccxt from 'ccxt';
import { Order } from 'ccxt';
import { Candle } from '../../../common/types';

@Injectable()
export class DemoMarketService implements MarketProvider {
  private initialBalance = 10_000;
  private balanceUSD: number = this.initialBalance;
  private balances: Map<string, number> = new Map();
  private orders: Order[] = [];
  private readonly exchange: ccxt.binance;

  constructor() {
    this.exchange = new ccxt.binance({
      enableRateLimit: true,
      options: {
        defaultType: 'spot'
      }
    });

    this.reset();
  }

  public account(): Promise<any> {
    return Promise.resolve(undefined);
  }

  private extractAsset(symbol: string): string {
    return symbol.split('/')[0];
  }

  public reset(initialBalance: number = 10_000): void {
    this.initialBalance = initialBalance;
    this.balanceUSD = initialBalance;
    this.balances.clear();
    this.orders = [];
  }

  async getPrice(symbol: string): Promise<number> {
    // В демо можно брать цену с Binance Testnet или мокать
    const res = await axios.get('https://testnet.binance.vision/api/v3/ticker/price', {
      params: { symbol }
    });
    return parseFloat(res.data.price);
  }

  async executeMarketOrder(symbol: string, side: 'buy' | 'sell', amount: number): Promise<Order> {
    const price = await this.getPrice(symbol);
    const asset = this.extractAsset(symbol);
    const cost = price * amount;

    const order: Order = {
      clientOrderId: '',
      lastTradeTimestamp: 0,
      postOnly: false,
      reduceOnly: false,
      trades: [],
      id: `${Date.now()}`,
      timestamp: Date.now(),
      datetime: new Date().toISOString(),
      symbol,
      type: 'market',
      side,
      price,
      amount,
      cost,
      filled: amount,
      remaining: 0,
      status: 'closed',
      fee: undefined,
      info: {}
    };

    if (side === 'buy') {
      if (this.balanceUSD < cost) {
        throw new Error(`❌ Not enough USD. Have: ${this.balanceUSD}, need: ${cost}`);
      }

      this.balanceUSD -= cost;
      this.balances.set(asset, (this.balances.get(asset) || 0) + amount);
    } else if (side === 'sell') {
      const assetBalance = this.balances.get(asset) || 0;
      if (assetBalance < amount) {
        throw new Error(`❌ Not enough ${asset}. Have: ${assetBalance}, need: ${amount}`);
      }

      this.balances.set(asset, assetBalance - amount);
      this.balanceUSD += cost;
    }

    this.orders.push(order);
    return order;
  }

  async getBalance(symbol = 'USDT'): Promise<number> {
    return symbol === 'USDT' ? this.balanceUSD : this.balances.get(symbol) || 0;
  }

  async cancelAllOrders(symbol: string): Promise<void> {
    // Просто очищаем in-memory список ордеров
    this.orders = this.orders.filter((o) => o.symbol !== symbol);
  }

  async fetchOHLCV(symbol: string, timeframe: string, since?: number, limit?: number): Promise<Candle[]> {
    const raw = await this.exchange.fetchOHLCV(symbol, timeframe, since, limit);
    return raw.map(([timestamp, open, high, low, close, volume]) => ({
      timestamp,
      open,
      high,
      low,
      close,
      volume
    }));
  }

  roundToStepSize(quantity: number, stepSize: number): number {
    return 0;
  }

  findOpenPosition(symbol: string): Promise<any> {
    return Promise.resolve(undefined);
  }

  fetchLatestRealizedPnL(symbol: string): Promise<number | null> {
    return Promise.resolve(undefined);
  }
}
