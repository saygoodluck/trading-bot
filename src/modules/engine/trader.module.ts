import { Module } from '@nestjs/common';
import { PositionModule } from '../position/position.module';
import { MarketModule } from '../market/market.module';
import { MarketOrderModule } from '../order/market-order.module';
import { LiveTraderEngine } from './live.trader.engine';
import { BacktestTraderEngine } from './backtest.trader.engine';

@Module({
  imports: [PositionModule, MarketModule, MarketOrderModule],
  controllers: [],
  providers: [LiveTraderEngine, BacktestTraderEngine],
  exports: [LiveTraderEngine, BacktestTraderEngine]
})
export class TraderModule {}
