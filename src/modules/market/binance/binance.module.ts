import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BinanceFuturesTestnetService } from './binance-futures.testnet.service';

@Module({
  imports: [ConfigModule],
  controllers: [],
  providers: [BinanceFuturesTestnetService],
  exports: [BinanceFuturesTestnetService]
})
export class BinanceModule {}
