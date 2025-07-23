import { Module } from '@nestjs/common';
import { BacktestService } from './backtest.service';
import { BinanceModule } from '../binance/binance.module';
import { WalletModule } from '../wallet/wallet.module';
import { BacktestController } from './backtest.controller';
import { TradeLoggerModule } from '../logger/trade-logger.module';
import { BacktestRunnerService } from './backtest.runner.service';
import { StrategyModule } from '../strategy/core/strategy.module';

@Module({
  imports: [BinanceModule, WalletModule, TradeLoggerModule, StrategyModule],
  controllers: [BacktestController],
  providers: [BacktestService, BacktestRunnerService],
  exports: [BacktestService]
})
export class BacktestModule {}
