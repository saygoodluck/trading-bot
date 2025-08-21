import { Module } from '@nestjs/common';
import { SimExecutor } from './sim.executor';
import { BinanceExecutor } from './binance.executor';
import { ConfigModule } from '@nestjs/config';
import { SimFuturesExecutor } from './sim-futures.executor';

@Module({
  imports: [ConfigModule],
  providers: [SimExecutor, BinanceExecutor, SimFuturesExecutor],
  exports: [SimExecutor, BinanceExecutor, SimFuturesExecutor]
})
export class ExecutorModule {}
