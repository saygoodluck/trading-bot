import { Module } from '@nestjs/common';
import { BinanceModule } from '../market/binance/binance.module';
import { BacktestController } from './backtest.controller';
import { StrategyModule } from '../strategy/strategy.module';
import { TraderModule } from '../engine/trader.module';
import { MarketModule } from '../market/market.module';
import { BacktestRunner } from './backtest.runner';

@Module({
  imports: [BinanceModule, StrategyModule, TraderModule, MarketModule],
  controllers: [BacktestController],
  providers: [BacktestRunner],
  exports: [BacktestRunner]
})
export class BacktestModule {}
