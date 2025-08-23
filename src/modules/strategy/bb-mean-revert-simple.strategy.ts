import { Injectable, Scope } from '@nestjs/common';
import { IStrategy } from './strategy.interface';
import { Context, StrategyParams } from '../../common/types';
import { Signal } from './strategy-signal';
import { EMA, ATR } from '../../common/utils/indicators';

@Injectable({ scope: Scope.TRANSIENT })
export class BbMeanRevertSimple implements IStrategy {
  name = 'BbMeanRevertSimple';

  // минимальный, осмысленный набор параметров (без onCloseOnly)
  params: StrategyParams = {
    bbPeriod: 20,
    bbMult: 2,

    useEmaFilter: true,
    emaPeriod: 50,

    atrPeriod: 14,      // для фильтров/волы
    minAtr: 0,          // абсолютный ATR-фильтр (можно 0)

    longOnly: true,
    requireRecross: true,
    cooldownBars: 2,

    // режимные фильтры (в процентах от цены через ATR%):
    volFloorAtrPct: 0.006,
    maxVolAtrPct: 0.04,

    // фильтр наклона EMA (в б.п./бар)
    emaSlopeLookback: 15,
    emaSlopeMinBp: 8,

    debug: false
  } as any;

  private lastSignalBarIndex = -1;

  private tsOf(c: any): number | undefined {
    const v = c?.timestamp;
    return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
  }

  evaluate(ctx: Context): Signal {
    const candles = ctx.candles || [];
    const N = candles.length;
    if (N < 3) return { action: 'hold' };

    // --- cooldown по барам
    const cdBars = Math.max(0, Number(this.params.cooldownBars ?? 0));
    if (cdBars > 0 && this.lastSignalBarIndex >= 0 && (N - 1) - this.lastSignalBarIndex < cdBars) {
      return { action: 'hold' };
    }

    // --- подготовка данных
    const closes = candles.map(c => Number(c.close));
    const now  = candles[N - 1];
    const prev = candles[N - 2];
    const price = closes[N - 1];
    const prevPrice = closes[N - 2];

    // --- параметры и базовые проверки длины
    const bbP  = Math.max(2, Number(this.params.bbPeriod));
    const bbM  = Number(this.params.bbMult);
    const emaP = Math.max(2, Number(this.params.emaPeriod));
    const atrP = Math.max(1, Number(this.params.atrPeriod));

    const needLen = Math.max(bbP + 2, emaP + 1, atrP + 1);
    if (closes.length < needLen) return { action: 'hold' };

    // --- полосы Боллинджера (по последнему окну)
    const bbSlice = closes.slice(-bbP);
    const mean = bbSlice.reduce((a, b) => a + b, 0) / bbSlice.length;
    const variance = bbSlice.reduce((a, b) => a + (b - mean) ** 2, 0) / bbSlice.length;
    const stdev = Math.sqrt(variance);
    const bbUpper = mean + bbM * stdev;
    const bbLower = mean - bbM * stdev;
    const bbMid   = mean;

    // --- ATR и волатильность
    const atrArr = ATR(candles, atrP);
    const atrNowAbs = atrArr[atrArr.length - 1];
    const atrPct = (Number.isFinite(atrNowAbs) && price > 0) ? atrNowAbs / price : 0;

    const minAtrAbs = Number(this.params.minAtr ?? 0);
    const atrOk = minAtrAbs > 0 ? (Number.isFinite(atrNowAbs) && atrNowAbs >= minAtrAbs) : true;

    const volFloor = Number(this.params.volFloorAtrPct ?? 0);
    const volCeil  = Number(this.params.maxVolAtrPct ?? 0);
    const volOK =
      (volFloor === 0 || atrPct >= volFloor) &&
      (volCeil  === 0 || atrPct <= volCeil);

    // --- EMA фильтр стороны
    const useEma = Boolean(this.params.useEmaFilter);
    const emaNow = useEma
      ? (ctx.market?.ema?.[emaP] ?? EMA(closes, emaP).slice(-1)[0])
      : NaN;

    const emaOkLong  = !useEma || price >= emaNow;
    const emaOkShort = !useEma || price <= emaNow;

    // --- наклон EMA (доп. фильтр)
    const look = Math.max(0, Number(this.params.emaSlopeLookback ?? 0));
    const minSlopeBp = Number(this.params.emaSlopeMinBp ?? 0);
    let slopeOKLong = true, slopeOKShort = true;

    if (look > 0) {
      // гарантируем, что у нас хватает данных на lookback
      if (closes.length < emaP + look) return { action: 'hold' };

      const emaSeries = EMA(closes, emaP);
      const eNow  = emaSeries[emaSeries.length - 1];
      const ePast = emaSeries[emaSeries.length - 1 - look];

      if (Number.isFinite(eNow) && Number.isFinite(ePast) && ePast > 0) {
        const slopePerBar = (eNow - ePast) / ePast / look; // доля/бар
        const slopeBp = slopePerBar * 10000;               // б.п./бар
        slopeOKLong  = slopeBp >=  minSlopeBp;
        slopeOKShort = slopeBp <= -minSlopeBp;
      } else {
        slopeOKLong = slopeOKShort = false;
      }
    }

    // --- выход по средней полосе (симметрично для long/short)
    if (price >= bbMid && prevPrice < bbMid) return { action: 'close', reason: 'cross up mid' };
    if (price <= bbMid && prevPrice > bbMid) return { action: 'close', reason: 'cross down mid' };

    // --- события входа: прокол/возврат
    const requireRecross = Boolean(this.params.requireRecross);
    const breachBelowLower   = prevPrice >= bbLower && price <  bbLower;
    const recrossAboveLower  = prevPrice <  bbLower && price >= bbLower;

    const breachAboveUpper   = prevPrice <= bbUpper && price >  bbUpper;
    const recrossBelowUpper  = prevPrice >  bbUpper && price <= bbUpper;

    const longEntry  = requireRecross ? recrossAboveLower : breachBelowLower;
    const shortEntry = requireRecross ? recrossBelowUpper : breachAboveUpper;

    // --- режимные допуски
    const allowLong  = volOK && atrOk && emaOkLong  && (look === 0 ? true : slopeOKLong);
    const allowShort = volOK && atrOk && emaOkShort && (look === 0 ? true : slopeOKShort);

    // --- сигналы
    if (longEntry && allowLong) {
      this.lastSignalBarIndex = N - 1;
      return { action: 'buy',  reason: requireRecross ? 'recross above lower BB' : 'breach below lower BB', confidence: 0.9 };
    }

    if (!Boolean(this.params.longOnly) && shortEntry && allowShort) {
      this.lastSignalBarIndex = N - 1;
      return { action: 'sell', reason: requireRecross ? 'recross below upper BB' : 'breach above upper BB', confidence: 0.9 };
    }

    if (this.params.debug) {
      const ts = this.tsOf(now);
      // eslint-disable-next-line no-console
      console.log('[BbMeanRevertSimple]', {
        barIndex: N - 1,
        ts, iso: ts ? new Date(ts).toISOString() : undefined,
        price, bbLower, bbMid, bbUpper,
        useEma, emaNow, emaOkLong, emaOkShort,
        atrNowAbs, atrPct, volFloor, volCeil, volOK,
        look, minSlopeBp, slopeOKLong, slopeOKShort,
        requireRecross, breachBelowLower, recrossAboveLower, breachAboveUpper, recrossBelowUpper,
        longOnly: Boolean(this.params.longOnly)
      });
    }

    return { action: 'hold' };
  }
}
