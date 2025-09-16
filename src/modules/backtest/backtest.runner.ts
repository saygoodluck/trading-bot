import { Engine } from '../engine/engine';
import { Candle } from '../../common/types';
import { IOrderExecutor } from '../execution/order-executor.interface';

export class BacktestRunner {
  constructor(
    private readonly exec: IOrderExecutor,
    private readonly engine: Engine,
    private readonly symbol: string
  ) {}

  async run(candles: Candle[]) {
    for (const bar of candles) {
      this.exec.markToMarket(this.symbol, bar.close, bar.timestamp);
      if (this.exec.isTradingPaused(bar.timestamp)) continue;

      // пример «дневного стопа» — при -5% ставим паузу до завтра:
      if (this.exec.dayPnLPct(bar.timestamp) <= -0.05) {
        this.exec.pauseUntilNextDay(bar.timestamp);
        continue;
      }
      const o = await this.engine.execute(bar);
      if (o) {
        await this.exec.place(o);
      }
    }
    return this.exec.report();
  }
}
