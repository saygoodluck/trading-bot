import { Controller, Get, Query } from '@nestjs/common';
import { BinanceService } from './binance.service';

@Controller('/binance')
export class BinanceController {
  constructor(private readonly binanceService: BinanceService) {}

  @Get('/price')
  async getPrice(@Query('symbol') symbol = 'BTC/USDT') {
    return this.binanceService.getPrice(symbol);
  }

  @Get('/orderbook')
  async getBook(@Query('symbol') symbol = 'BTC/USDT') {
    return this.binanceService.getOrderBook(symbol);
  }
}