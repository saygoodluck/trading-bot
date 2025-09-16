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
      await this.engine.execute(bar);
    }
    return this.exec.report();
  }
}
