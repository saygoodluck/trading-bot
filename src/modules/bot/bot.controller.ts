import { Body, Controller, Post } from '@nestjs/common';
import { Engine } from '../engine/engine';
import { RunBotDto } from './dto/run.bot.dto';
import { StrategiesRegistry } from '../strategy/strategies.registry';
import { LiveRunner } from './live.runner';
import { BinanceExecutor } from '../execution/binance.executor';
import { BinanceStreamService } from '../stream/binance-stream.service';
import { BinanceKlineProvider } from '../market/binance-kline.provider';

@Controller('/bot')
export class BotController {
  private runner?: LiveRunner;

  constructor(
    private readonly market: BinanceKlineProvider,
    private readonly exec: BinanceExecutor,
    private readonly strategies: StrategiesRegistry,
    private readonly stream: BinanceStreamService
  ) {}

  @Post('/run')
  async runBot(@Body() dto: RunBotDto) {
    const strategy = await this.strategies.build(dto.strategy, dto.params);

    const engine: Engine = new Engine(this.exec, {
      symbol: dto.symbol,
      timeframe: dto.timeframe,
      strategy,
      riskPct: 0.01,
      defaultAtrMult: 2,
      tpRR: 1.5,
      risk: {
        dailyLossStopPct: 2,      // стоп-день при -2%
        dailyProfitStopPct: 2,    // и при +2%
        maxTradesPerDay: 25
      },
      regime: {
        trendFilter: 'EMA200'     // торгуем только в ап-тренде над EMA200
      }
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
