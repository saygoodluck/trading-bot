import { Module } from '@nestjs/common';
import { TradeLoggerService } from './trade-logger.service';

@Module({
  providers: [TradeLoggerService],
  exports: [TradeLoggerService]
})
export class TradeLoggerModule {}
