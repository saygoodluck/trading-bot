import { Engine } from '../engine/engine';
import { Candle } from '../../common/types';
import { IOrderExecutor } from '../execution/order-executor.interface';

export class BacktestRunner {
  constructor(
    private readonly exec: IOrderExecutor,
    private readonly engine: Engine
  ) {}

  async run(candles: Candle[]) {
    for (const bar of candles) {
      const o = await this.engine.execute(bar);
      if (o) {
        await this.exec.place(o);
      }
      this.exec.markToMarket('SYMBOL', bar.close, bar.timeframe);
    }
    return this.exec.report();
  }
}
