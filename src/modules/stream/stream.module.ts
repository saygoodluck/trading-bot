import { Module } from '@nestjs/common';
import { BinanceStreamService } from './binance-stream.service';

@Module({
  imports: [],
  providers: [BinanceStreamService],
  exports: [BinanceStreamService]
})
export class StreamModule {}
