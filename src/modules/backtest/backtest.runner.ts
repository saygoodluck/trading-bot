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
      this.exec.markToMarket(this.symbol, bar.close, bar.timestamp, {
        open: Number(bar.open),
        high: Number(bar.high),
        low: Number(bar.low),
        close: Number(bar.close)
      });

      const o = await this.engine.execute(bar);
      if (o) await this.exec.place(o);
    }
    return this.exec.report();
  }
}
