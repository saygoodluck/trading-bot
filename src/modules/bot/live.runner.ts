import { Engine } from '../engine/engine';
import { BinanceExecutor } from '../execution/binance.executor';
import { BinanceStreamService } from '../stream/binance-stream.service';
import { BinanceKlineProvider } from '../market/binance-kline.provider';
import { TF } from '../../common/types';

export class LiveRunner {
  private running = false;
  private lastClosedTs = 0;

  constructor(
    private readonly market: BinanceKlineProvider,
    private readonly exec: BinanceExecutor,
    private readonly engine: Engine,
    private readonly stream: BinanceStreamService
  ) {}

  async run(symbol: string, timeframe: TF, preload = 50) {
    if (this.running) {
      return;
    }
    this.running = true;

    const history = await this.market.fetchOHLCV(symbol, timeframe, preload);

    for (const bar of history) {
      await this.engine.execute(bar);
    }

    // connect to kline stream
    this.stream.connectKlines(symbol, timeframe, async (bar) => {
      if (bar.timestamp <= this.lastClosedTs) return;
      this.lastClosedTs = bar.timestamp;

      const order = await this.engine.execute(bar);
      if (order) {
        await this.exec.place(order);
      }
    });
  }

  stop() {
    this.stream.close();
    this.running = false;
  }
}
