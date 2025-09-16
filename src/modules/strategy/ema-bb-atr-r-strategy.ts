import { Injectable, Scope } from '@nestjs/common';
import { IStrategy } from './strategy.interface';
import { Context, StrategyParams } from '../../common/types';
import { Signal } from './strategy-signal';
import { EMA, ATR } from '../../common/utils/indicators';

@Injectable({ scope: Scope.TRANSIENT })
export class BbMeanRevertSimple implements IStrategy {
  name = 'BbMeanRevertSimple';

  params: StrategyParams = {
    bbPeriod: 20,
    bbMult: 2,
    emaPeriod: 20,         // мягкий тренд-фильтр (можно выключить flag’ом ниже)
    useEmaFilter: false,   // по умолчанию — ВЫКЛ, чтобы точно были входы
    atrPeriod: 14,
    minAtr: 0,             // 0 = не фильтровать по ATR
    longOnly: false,
    contextFilter: false,  // HTF-режим не учитываем, чтобы сигналы точно были
    cooldownBars: 1,       // минимум — не душим частоту
    debug: false
  } as any;

  private lastSignalBarIndex = -1;
  private lastSignalTs: number | null = null;

  private getTs(c: any): number | undefined {
    const v = c?.timestamp;
    return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
  }

  evaluate(ctx: Context): Signal {
    const candles = ctx.candles;
    const N = candles?.length ?? 0;
    if (!candles || N < 30) return { action: 'hold' };

    // --- кулдаун по барам ---
    const cdBars = Number(this.params.cooldownBars ?? 0);
    if (cdBars > 0 && this.lastSignalBarIndex >= 0) {
      if ((N - 1) - this.lastSignalBarIndex < cdBars) return { action: 'hold' };
    }

    // --- данные ---
    const closes = candles.map(c => Number(c.close));
    const highs  = candles.map(c => Number(c.high));
    const lows   = candles.map(c => Number(c.low));
    const now    = candles[N - 1];
    const prev   = candles[N - 2];

    const price  = Number(now.close);
    const prevPrice = Number(prev.close);

    // --- Bollinger ---
    const bbP = Math.max(2, Number(this.params.bbPeriod));
    const bbM = Number(this.params.bbMult);
    if (closes.length < bbP + 2) return { action: 'hold' };

    const bbSlice = closes.slice(-bbP);
    const mean = bbSlice.reduce((a, b) => a + b, 0) / bbSlice.length;
    const variance = bbSlice.reduce((a, b) => a + (b - mean) ** 2, 0) / bbSlice.length;
    const stdev = Math.sqrt(variance);
    const bbUpper = mean + bbM * stdev;
    const bbLower = mean - bbM * stdev;
    const bbMid   = mean;

    // --- EMA (мягкий фильтр, можно выключить) ---
    const useEma = Boolean(this.params.useEmaFilter);
    let emaOkLong = true;
    let emaOkShort = true;
    if (useEma) {
      const emaArr = EMA(closes, Math.max(2, Number(this.params.emaPeriod)));
      const emaNow = emaArr[emaArr.length - 1];
      emaOkLong = price >= emaNow;   // long только если цена не ниже EMA
      emaOkShort = price <= emaNow;  // short только если цена не выше EMA
    }

    // --- ATR (опционально) ---
    let atrOk = true;
    const minAtr = Number(this.params.minAtr ?? 0);
    if (minAtr > 0) {
      const atrArr = ATR(candles, Math.max(1, Number(this.params.atrPeriod)));
      const atrNow = atrArr[atrArr.length - 1];
      atrOk = Number.isFinite(atrNow) && atrNow >= minAtr;
    }

    // --- EXIT (середина канала) ---
    // Движок сам закроет только если позиция есть, так что сигнал безопасен.
    if (price >= bbMid && prevPrice < bbMid) return { action: 'close', reason: 'cross up mid' };
    if (price <= bbMid && prevPrice > bbMid) return { action: 'close', reason: 'cross down mid' };

    // --- ENTRY ---
    const longOnly = Boolean(this.params.longOnly);

    // LONG: кросс ниже нижней полосы (prev выше/у полосы, now — ниже)
    const crossBelowLower = prevPrice >= bbLower && price < bbLower;
    if (crossBelowLower && emaOkLong && atrOk) {
      this.lastSignalBarIndex = N - 1;
      this.lastSignalTs = this.getTs(now) ?? null;
      return { action: 'buy', reason: 'close crossed below lower BB', confidence: 0.9 };
    }

    // SHORT: кросс выше верхней (включаем, если не longOnly)
    if (!longOnly) {
      const crossAboveUpper = prevPrice <= bbUpper && price > bbUpper;
      if (crossAboveUpper && emaOkShort && atrOk) {
        this.lastSignalBarIndex = N - 1;
        this.lastSignalTs = this.getTs(now) ?? null;
        return { action: 'sell', reason: 'close crossed above upper BB', confidence: 0.9 };
      }
    }

    // --- debug ---
    if (this.params.debug) {
      const ts = this.getTs(now);
      // eslint-disable-next-line no-console
      console.log('[BbMeanRevertSimple]', {
        barIndex: N - 1,
        ts,
        iso: ts ? new Date(ts).toISOString() : undefined,
        price,
        prevPrice,
        bbLower,
        bbMid,
        bbUpper,
        crossBelowLower,
        longOnly,
        emaFilter: useEma,
        atrOk
      });
    }

    return { action: 'hold' };
  }
}
