import { Body, Controller, Get, Post } from '@nestjs/common';
import { BacktestRunner } from './backtest.runner';
import { RunBacktestDto } from './dto/run.backtest.dto';
import { SimExecutor } from '../execution/sim.executor';
import { Engine } from '../engine/engine';
import { StrategiesRegistry } from '../strategy/strategies.registry';
import { Candle } from '../../common/types';
import { BinanceKlineProvider } from '../market/binance-kline.provider';

@Controller('backtest')
export class BacktestController {
  constructor(
    private readonly exec: SimExecutor,
    private readonly strategies: StrategiesRegistry,
    private readonly kline: BinanceKlineProvider
  ) {}

  @Post('/run')
  async run(@Body() dto: RunBacktestDto) {
    const candles: Candle[] = await this.kline.fetchOHLCV(dto.symbol, dto.timeframe, dto.limit);
    const strategy = this.strategies.build(dto.strategy, dto.params);
    const engine: Engine = new Engine(this.exec, {
      symbol: dto.symbol,
      timeframe: dto.timeframe,
      strategy: strategy,
      riskPct: 0.01,
      defaultAtrMult: 2,
      tpRR: 1.5
    });
    const runner: BacktestRunner = new BacktestRunner(this.exec, engine);
    return await runner.run(candles);
  }

  @Get('strategies')
  listStrategies() {
    return this.strategies.list();
  }
}
