import { Injectable, Scope } from '@nestjs/common';
import { IStrategy } from './strategy.interface';
import { Signal } from './strategy-signal';
import { Context, StrategyParams } from '../../common/types';
import { ATR, EMA } from '../../common/utils/indicators';

@Injectable({ scope: Scope.TRANSIENT })
export class BbEmaCombinerStrategy implements IStrategy {
  name = 'BbEmaCombinerStrategy';

  // В StrategyParams значения часто типизируются как string|number|boolean,
  // поэтому allowedHours задаём строкой, а парсим в массив в рантайме.
  params: StrategyParams = {
    emaPeriod: 20,
    bbPeriod: 20,
    bbMult: 2.0,
    atrPeriod: 14,

    emaHTF: 100,
    longOnly: true,
    contextFilter: true,

    thresholdLong: 1.5,
    thresholdShort: -1.5,

    w_bbTouch: 1.0,
    w_reentry: 1.0,
    w_emaSlope: 0.5,
    w_zscore: 1.0,
    w_atrOk: 0.25,
    w_timeOk: 0.25,

    zEnter: 2.0,
    reentryEps: 0.001,

    minAtrPct: 0.0010,
    maxAtrPct: 0.0100,

    antiTrendKatr: 1.5,
    useAntiTrend: true,

    // ВСЕ часы. Можно передать строку вида "9-17,19,21" или число "10"
    allowedHours: '*',

    takeOnUpper: true,
    takeOnLower: true,
    exitOnMidContra: true,

    debug: false
  };

  // ====== Вспомогательные ======
  private meanAndStdev(arr: number[]) {
    const n = arr.length;
    if (n === 0) return { mean: NaN, stdev: NaN };
    const mean = arr.reduce((a, b) => a + b, 0) / n;
    const variance = arr.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
    return { mean, stdev: Math.sqrt(variance) };
  }
  private zScore(x: number, mean: number, stdev: number) {
    return stdev > 0 ? (x - mean) / stdev : 0;
  }
  private slopeUp(series: number[], lookback = 2) {
    const n = series.length;
    if (n <= lookback) return false;
    return series[n - 1] > series[n - 1 - lookback];
  }
  private slopeDown(series: number[], lookback = 2) {
    const n = series.length;
    if (n <= lookback) return false;
    return series[n - 1] < series[n - 1 - lookback];
  }
  private hourUTC(ts: number) {
    const d = new Date(ts);
    return d.getUTCHours();
  }
  private getLastTs(ctx: Context) {
    const candles: any[] = (ctx as any).candles ?? [];
    const market: any = (ctx as any).market ?? {};
    const last = candles[candles.length - 1] || {};
    return (
      last.ts ??
      last.time ??
      last.openTime ??
      last.closeTime ??
      market.nowTs ??
      Date.now()
    );
  }

  // Преобразуем что угодно в массив часов [0..23]
  private toHoursArray(v: unknown): number[] {
    const all = Array.from({ length: 24 }, (_, h) => h);

    if (Array.isArray(v)) {
      return v
        .map((x) => Number(x))
        .filter((x) => Number.isFinite(x) && x >= 0 && x <= 23);
    }
    if (typeof v === 'number') {
      return Number.isFinite(v) && v >= 0 && v <= 23 ? [v] : all;
    }
    if (typeof v === 'boolean') {
      return v ? all : []; // true = все, false = ни одного
    }
    if (typeof v === 'string') {
      const s = v.trim();
      if (s === '' || s === '*' || s.toLowerCase() === 'all') return all;
      // поддержка диапазонов и списков: "9-17,19,21"
      const parts = s.split(',').map((chunk) => chunk.trim()).filter(Boolean);
      const out: number[] = [];
      for (const part of parts) {
        const range = part.split('-').map((t) => t.trim());
        if (range.length === 2) {
          const a = Number(range[0]);
          const b = Number(range[1]);
          if (Number.isFinite(a) && Number.isFinite(b)) {
            const from = Math.max(0, Math.min(23, Math.min(a, b)));
            const to = Math.max(0, Math.min(23, Math.max(a, b)));
            for (let h = from; h <= to; h++) out.push(h);
          }
        } else {
          const h = Number(part);
          if (Number.isFinite(h) && h >= 0 && h <= 23) out.push(h);
        }
      }
      return Array.from(new Set(out)).sort((a, b) => a - b);
    }

    // дефолт
    return all;
  }

  // ====== Основной ======
  evaluate(ctx: Context): Signal {
    const { candles, market } = ctx;
    const p = this.params;

    const minLen = Math.max(
      60,
      Number(p.bbPeriod) + 3,
      Number(p.emaPeriod) + 3,
      Number(p.atrPeriod) + 3,
      Number(p.emaHTF) + 3
    );
    if (!candles || candles.length < minLen) return { action: 'hold' };

    const closes = candles.map((c) => c.close);
    const price = closes[closes.length - 1];
    const prevClose = closes[closes.length - 2];

    const emaArr = EMA(closes, Number(p.emaPeriod));
    const emaNow = emaArr[emaArr.length - 1];
    const emaUp = this.slopeUp(emaArr, 2);
    const emaDown = this.slopeDown(emaArr, 2);

    const atrArr = ATR(candles, Number(p.atrPeriod));
    const atrNow = atrArr[atrArr.length - 1];

    const emaHTFArr = EMA(closes, Number(p.emaHTF));
    const emaHTFNow = emaHTFArr[emaHTFArr.length - 1];
    const emaHTFUp = this.slopeUp(emaHTFArr, 2);
    const emaHTFDown = this.slopeDown(emaHTFArr, 2);

    const bbP = Number(p.bbPeriod);
    const bbSlice = closes.slice(-bbP);
    const { mean: bbMean, stdev: bbStd } = this.meanAndStdev(bbSlice);
    const bbUpper = bbMean + Number(p.bbMult) * bbStd;
    const bbLower = bbMean - Number(p.bbMult) * bbStd;
    const bbMid = bbMean;

    const lastTs = this.getLastTs(ctx);
    const hour = this.hourUTC(lastTs);

    const hoursAllowed = this.toHoursArray((p as any).allowedHours);
    const timeOk = hoursAllowed.includes(hour);

    const atrPct = atrNow / Math.max(price, 1e-8);
    const atrOk = atrPct >= Number(p.minAtrPct) && atrPct <= Number(p.maxAtrPct);

    const z = this.zScore(price, bbMean, bbStd);

    // ====== LONG score ======
    let scoreLong = 0;
    const longSignals: string[] = [];
    const longBans: string[] = [];

    if (price <= bbLower * (1 + Number(p.reentryEps))) {
      scoreLong += Number(p.w_bbTouch);
      longSignals.push('bbTouchLower');
    }
    if (prevClose < bbLower && price > bbLower * (1 + Number(p.reentryEps))) {
      scoreLong += Number(p.w_reentry);
      longSignals.push('reentryFromLower');
    }
    if (emaUp) {
      scoreLong += Number(p.w_emaSlope);
      longSignals.push('emaSlopeUp');
    }
    if (z <= -Math.abs(Number(p.zEnter))) {
      scoreLong += Number(p.w_zscore);
      longSignals.push('zOversold');
    }
    if (atrOk) {
      scoreLong += Number(p.w_atrOk);
      longSignals.push('atrOk');
    }
    if (timeOk) {
      scoreLong += Number(p.w_timeOk);
      longSignals.push('timeOk');
    }

    if (p.useAntiTrend) {
      const farBelow = (emaHTFNow - price) / Math.max(atrNow, 1e-8) > Number(p.antiTrendKatr);
      if (emaHTFDown && farBelow) longBans.push('antiTrendStrongDown');
    }
    if (p.contextFilter && p.longOnly && market?.trendHTF === 'down') {
      longBans.push('contextHTF=down');
    }

    // ====== SHORT score ======
    let scoreShort = 0;
    const shortSignals: string[] = [];
    const shortBans: string[] = [];

    if (!p.longOnly) {
      if (price >= bbUpper * (1 - Number(p.reentryEps))) {
        scoreShort += Number(p.w_bbTouch);
        shortSignals.push('bbTouchUpper');
      }
      if (prevClose > bbUpper && price < bbUpper * (1 - Number(p.reentryEps))) {
        scoreShort += Number(p.w_reentry);
        shortSignals.push('reentryFromUpper');
      }
      if (emaDown) {
        scoreShort += Number(p.w_emaSlope);
        shortSignals.push('emaSlopeDown');
      }
      if (z >= Math.abs(Number(p.zEnter))) {
        scoreShort += Number(p.w_zscore);
        shortSignals.push('zOverbought');
      }
      if (atrOk) {
        scoreShort += Number(p.w_atrOk);
        shortSignals.push('atrOk');
      }
      if (timeOk) {
        scoreShort += Number(p.w_timeOk);
        shortSignals.push('timeOk');
      }

      if (p.useAntiTrend) {
        const farAbove = (price - emaHTFNow) / Math.max(atrNow, 1e-8) > Number(p.antiTrendKatr);
        if (emaHTFUp && farAbove) shortBans.push('antiTrendStrongUp');
      }
      if (p.contextFilter && market?.trendHTF === 'up') {
        shortBans.push('contextHTF=up');
      }
    }

    // ====== Мягкие EXIT-сигналы ======
    if (p.takeOnUpper && price >= bbUpper && emaDown) {
      return this.debugOut(
        { action: 'close', reason: 'long: take at upper & emaDown' },
        { price, bbUpper, emaNow }
      );
    }
    if (p.exitOnMidContra && price >= bbMid && emaDown) {
      return this.debugOut(
        { action: 'close', reason: 'long: mid-cross & emaDown' },
        { price, bbMid, emaNow }
      );
    }
    if (!p.longOnly) {
      if (p.takeOnLower && price <= bbLower && emaUp) {
        return this.debugOut(
          { action: 'close', reason: 'short: take at lower & emaUp' },
          { price, bbLower, emaNow }
        );
      }
      if (p.exitOnMidContra && price <= bbMid && emaUp) {
        return this.debugOut(
          { action: 'close', reason: 'short: mid-cross & emaUp' },
          { price, bbMid, emaNow }
        );
      }
    }

    // ====== Входы ======
    const bannedLong = longBans.length > 0;
    const bannedShort = shortBans.length > 0;

    if (!bannedLong && scoreLong >= Number(p.thresholdLong)) {
      return this.debugOut(
        {
          action: 'buy',
          reason: `scoreLong ${scoreLong.toFixed(2)}≥${p.thresholdLong}`,
          confidence: clamp(scoreLong / 3, 0.5, 0.99)
        },
        {
          longSignals,
          longBans,
          z: Number(z.toFixed(2)),
          emaUp,
          atrPct: Number(atrPct.toFixed(4)),
          hour
        }
      );
    }

    if (!p.longOnly && !bannedShort && scoreShort <= Number(p.thresholdShort)) {
      return this.debugOut(
        {
          action: 'sell',
          reason: `scoreShort ${scoreShort.toFixed(2)}≤${p.thresholdShort}`,
          confidence: clamp(Math.abs(scoreShort) / 3, 0.5, 0.99)
        },
        {
          shortSignals,
          shortBans,
          z: Number(z.toFixed(2)),
          emaDown,
          atrPct: Number(atrPct.toFixed(4)),
          hour
        }
      );
    }

    if (p.debug) {
      // eslint-disable-next-line no-console
      console.log('[BbEmaCombinerStrategy/HOLD]', {
        price,
        bbLower: round(bbLower),
        bbMid: round(bbMid),
        bbUpper: round(bbUpper),
        z: Number(z.toFixed(2)),
        scoreLong: Number(scoreLong.toFixed(2)),
        scoreShort: Number(scoreShort.toFixed(2)),
        longBans,
        shortBans,
        emaNow: round(emaNow),
        emaUp, emaDown,
        emaHTFNow: round(emaHTFNow),
        emaHTFUp, emaHTFDown,
        atrNow: Number(atrNow.toFixed(4)),
        atrPct: Number(atrPct.toFixed(4)),
        hour,
        trendHTF: market?.trendHTF
      });
    }

    return { action: 'hold' };
  }

  private debugOut(sig: Signal, details?: unknown): Signal {
    if (this.params.debug) {
      // eslint-disable-next-line no-console
      console.log('[BbEmaCombinerStrategy/SIGNAL]', sig, details ?? '');
    }
    return sig;
  }
}

// ====== Утилы ======
function clamp(x: number, a: number, b: number) {
  return Math.max(a, Math.min(b, x));
}
function round(x: number, k = 4) {
  const p = Math.pow(10, k);
  return Math.round(x * p) / p;
}
