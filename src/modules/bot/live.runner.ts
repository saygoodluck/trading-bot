import { MarketProvider } from '../market/market-provider.interface';
import { Engine } from '../engine/engine';
import { BinanceExecutor } from '../execution/binance.executor';
import { BinanceStreamService } from '../stream/binance-stream.service';

export class LiveRunner {
  private running = false;
  private lastClosedTs = 0;

  constructor(
    private readonly market: MarketProvider,
    private readonly exec: BinanceExecutor,
    private readonly engine: Engine,
    private readonly stream: BinanceStreamService
  ) {}

  async run(symbol: string, timeframe: string, preload = 50) {
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
      if (bar.timeframe <= this.lastClosedTs) return;
      this.lastClosedTs = bar.timeframe;

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
