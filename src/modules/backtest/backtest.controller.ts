import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { RunBacktestDto } from './dto/run.backtest.dto';
import { BinanceKlineProvider } from '../market/binance-kline.provider';
import { StrategiesRegistry } from '../strategy/strategies.registry';
import { Candle } from '../../common/types';
import { parseFromToMs } from '../../common/utils/time';
import { BacktestRunner } from './backtest.runner';
import { summarizeTradeWindows } from '../../common/utils/backtest.utils';
import { attachPnLToTripsFromTrades, buildRoundTripsWithBars, equityMetrics, splitByDate, tripsMetrics } from '../../common/utils/analytics';
import { EngineFactory } from '../engine/engine.factory';

// ───────────────────────────────────────────────────────────────────────────────

@Controller('/backtest')
export class BacktestController {
  constructor(
    private readonly strategies: StrategiesRegistry,
    private readonly kline: BinanceKlineProvider
  ) {}

  @Post('/run')
  async run(@Body() dto: RunBacktestDto) {
    const now = Date.now();

    // --- from/to + валидация
    const parsedFrom = dto.from ? parseFromToMs(dto.from) : this.defaultFromForTF(dto.timeframe, now);
    if (!Number.isFinite(parsedFrom)) throw new BadRequestException('Invalid "from" date');

    const parsedTo = dto.to ? parseFromToMs(dto.to) : now;
    if (!Number.isFinite(parsedTo)) throw new BadRequestException('Invalid "to" date');

    const fromTs = parsedFrom;
    const toTs = Math.min(parsedTo, now);
    if (fromTs >= toTs) throw new BadRequestException('"from" must be earlier than "to"');

    // --- данные
    const candles: Candle[] = await this.kline.fetchRangeCached(dto.symbol, dto.timeframe as any, fromTs, toTs);

    // --- стратегия/движок (через фабрику)
    const strategy = await this.strategies.build(dto.strategy, dto.params);
    const { exec, engine } = EngineFactory.create({
      symbol: dto.symbol,
      timeframe: dto.timeframe,
      strategy
    });

    const runner: BacktestRunner = new BacktestRunner(exec, engine, dto.symbol);
    const res = await runner.run(candles);

    // --- Эквити и барная шкала
    const equity = res.equityCurve ?? [];
    const barTs = candles.map((c) => c.timestamp); // шкала времени считаем по свечам

    // Окна торговли
    const tw = summarizeTradeWindows(res.trades ?? [], barTs);

    // Нормализация трейдов под аналитику
    const normTrades = (res.trades ?? []).map((t: any) => ({
      timestamp: typeof t.timestamp === 'number' ? t.timestamp : (t.ts as number),
      side: String(t.side ?? '').toUpperCase(),
      qty: t.qty,
      amount: t.amount,
      price: t.price,
      fee: t.fee
    }));

    // --- Раунд-трипы: сначала bars, затем PnL (FIFO + комиссии)
    let trips = buildRoundTripsWithBars(normTrades as any, barTs);
    trips = attachPnLToTripsFromTrades(trips, normTrades as any);

    // Метрики
    const eqMx = equityMetrics(equity);
    const tripMx = tripsMetrics(trips);

    // Walk-Forward (фиксированный сплит как в примерах)
    const defaultSplit = Date.parse('2025-06-30T23:59:59Z');
    const splitTs = Math.max(fromTs, Math.min(defaultSplit, toTs));
    const { ins: eqINS, oos: eqOOS } = splitByDate(equity, splitTs);
    const wf = { splitTs, ins: equityMetrics(eqINS), oos: equityMetrics(eqOOS) };

    const summary = {
      ...res.summary,
      backtestFromTs: fromTs,
      backtestToTs: toTs,
      backtestFrom: new Date(fromTs).toISOString(),
      backtestTo: new Date(toTs).toISOString(),
      tradedFromTs: tw.tradedFromTs,
      tradedToTs: tw.tradedToTs,
      tradedFrom: tw.tradedFrom,
      tradedTo: tw.tradedTo,
      ...tripMx,
      sharpe: eqMx.sharpe,
      maxDD: eqMx.maxDD,
      monthly: eqMx.monthly,
      walkForward: wf
    };

    return {
      ...res,
      summary,
      tradeSpans: tw.tradeSpans,
      roundTrips: trips
    };
  }

  // ────────────────────────────────────────────────────────────────────

  private defaultFromForTF(tf: string, now: number): number {
    const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
    const byTf: Record<string, number> = {
      '1m': 90 * 24 * 60 * 60 * 1000,
      '3m': 180 * 24 * 60 * 60 * 1000,
      '5m': 270 * 24 * 60 * 60 * 1000,
      '15m': YEAR_MS,
      '30m': YEAR_MS,
      '1h': 2 * YEAR_MS,
      '2h': 2 * YEAR_MS,
      '4h': 3 * YEAR_MS,
      '6h': 3 * YEAR_MS,
      '8h': 3 * YEAR_MS,
      '12h': 4 * YEAR_MS,
      '1d': 5 * YEAR_MS
    };
    const lookback = byTf[tf] ?? YEAR_MS;
    return now - lookback;
  }
}
