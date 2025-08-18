import { Body, Controller, Inject, Post } from '@nestjs/common';
import { Engine } from '../engine/engine';
import { RunBotDto } from './dto/run.bot.dto';
import { StrategiesRegistry } from '../strategy/strategies.registry';
import { LiveRunner } from './live.runner';
import { MARKET_PROVIDER } from '../market/market-provider.factory';
import { MarketProvider } from '../market/market-provider.interface';
import { BinanceExecutor } from '../execution/binance.executor';
import { BinanceStreamService } from '../stream/binance-stream.service';

@Controller('/bot')
export class BotController {
  private runner?: LiveRunner;

  constructor(
    @Inject(MARKET_PROVIDER) private readonly market: MarketProvider,
    private readonly exec: BinanceExecutor,
    private readonly strategies: StrategiesRegistry,
    private readonly stream: BinanceStreamService
  ) {}

  @Post('/run')
  async runBot(@Body() dto: RunBotDto) {
    const strategy = this.strategies.build(dto.strategy, dto.params);
    const engine: Engine = new Engine(this.exec, {
      symbol: dto.symbol,
      timeframe: dto.timeframe,
      strategy,
      strategyriskPct: 0.01,
      defaultAtrMult: 2,
      tpRR: 1.5
    });
    const runner: LiveRunner = new LiveRunner(this.market, this.exec, engine, this.stream);
    return await runner.run(dto.symbol, dto.timeframe);
  }

  @Post('/stop')
  async stopBot() {
    this.runner?.stop();
    return { ok: true };
  }
}
