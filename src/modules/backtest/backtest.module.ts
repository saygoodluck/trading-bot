import { Module } from '@nestjs/common';
import { BacktestController } from './backtest.controller';
import { StrategyModule } from '../strategy/strategy.module';
import { EngineModule } from '../engine/engine.module';
import { KlineModule } from '../market/kline.module';
import { BacktestRunner } from './backtest.runner';

@Module({
  imports: [StrategyModule, EngineModule, KlineModule],
  controllers: [BacktestController],
  providers: [BacktestRunner],
  exports: [BacktestRunner]
})
export class BacktestModule {}
