import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BinanceKlineProvider } from './binance-kline.provider';

@Module({
  imports: [ConfigModule],
  controllers: [],
  providers: [BinanceKlineProvider],
  exports: [BinanceKlineProvider]
})
export class KlineModule {}
