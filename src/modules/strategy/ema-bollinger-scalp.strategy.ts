import { Signal } from './strategy-signal';
import { ATR, EMA } from '../../common/utils/indicators';
import { IStrategy } from './strategy.interface';
import { Context, StrategyParams } from '../../common/types';
import { Injectable, Scope } from '@nestjs/common';

@Injectable({ scope: Scope.TRANSIENT })
export class EmaBollingerScalpStrategy implements IStrategy {
  name = 'EmaBollingerScalpStrategy';

  /**
   * Параметры — сделаны «живее», чтобы были входы на 15m BNB
   */
  params: StrategyParams = {
    emaPeriod: 21,           // быстрее реагирует
    bbPeriod: 20,
    bbMult: 2.0,             // уже, чем 2.2 → больше событий
    atrPeriod: 14,

    longOnly: false,         // включи обе стороны — больше возможностей
    contextFilter: true,
    debug: false,

    // режим/волатильность — пороги понижены
    minAtrPct: 0.0012,       // ≥0.12% от цены
    minBandWidthPct: 0.003,  // ≥0.3% ширина полос

    // точность входа
    bandTouchTol: 0.004,     // 0.4% допуск к касанию
    emaSlopeLookback: 3,     // наклон EMA
    reentryCooldownBars: 3   // чтобы не «пилить» каждый бар
  };

  private lastActionBarIndex: number | null = null;

  evaluate(ctx: Context): Signal {
    const { candles, market } = ctx;
    if (!candles || candles.length < 60) return { action: 'hold' };

    const n = candles.length;
    const closes = candles.map(c => c.close);
    const price = closes[n - 1];
    const prevPrice = closes[n - 2];

    // --- EMA и наклон
    const emaArr = EMA(closes, Number(this.params.emaPeriod));
    if (emaArr.length < 5) return { action: 'hold' };
    const emaNow = emaArr[emaArr.length - 1];
    const emaPrev = emaArr[Math.max(0, emaArr.length - 1 - Number(this.params.emaSlopeLookback) | 0)];
    const emaRising = emaNow > emaPrev;
    const emaFalling = emaNow < emaPrev;

    // --- Bollinger
    const bbP = Number(this.params.bbPeriod);
    const bbM = Number(this.params.bbMult);
    if (closes.length < bbP + 2) return { action: 'hold' };

    const slice = closes.slice(-bbP);
    const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
    const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / slice.length;
    const stdev = Math.sqrt(variance);
    const bbUpper = mean + bbM * stdev;
    const bbLower = mean - bbM * stdev;
    const bbMid = mean;

    // --- ATR / режим
    const atrArr = ATR(candles, Number(this.params.atrPeriod));
    if (!atrArr.length) return { action: 'hold' };
    const atrNow = atrArr[atrArr.length - 1];
    const atrPct = atrNow / Math.max(1e-9, price);
    const bandWidthPct = (bbUpper - bbLower) / Math.max(1e-9, bbMid);

    // --- фильтры контекста (HTF)
    if (this.params.contextFilter) {
      // если только лонги — не торгуем против явного даун-тренда
      if (this.params.longOnly && market.trendHTF === 'down') return { action: 'hold' };
    }

    // --- фильтры режима (слабый рынок — пропускаем)
    if (atrPct < Number(this.params.minAtrPct)) return { action: 'hold' };
    if (bandWidthPct < Number(this.params.minBandWidthPct)) return { action: 'hold' };

    // --- анти-частокол
    if (this.lastActionBarIndex != null && (n - 1) - this.lastActionBarIndex < Number(this.params.reentryCooldownBars)) {
      // недавнее действие — пропустим бар
      return { action: 'hold' };
    }

    const tol = Number(this.params.bandTouchTol);
    const nearLower = price <= bbLower * (1 + tol);
    const nearUpper = price >= bbUpper * (1 - tol);

    // «возврат внутрь полос» (reversion trigger)
    const crossedUpFromBelow = prevPrice < bbLower && price > bbLower;   // для лонга
    const crossedDownFromAbove = prevPrice > bbUpper && price < bbUpper; // для шорта

    // ====== EXIT (мягко закрываем у средней, если наклон против нас)
    // движок безопасно проигнорирует close без позиции
    if (price >= bbMid && emaFalling) {
      this.lastActionBarIndex = n - 1;
      return { action: 'close', reason: 'revert to mid; ema falling' };
    }
    if (price <= bbMid && emaRising) {
      this.lastActionBarIndex = n - 1;
      return { action: 'close', reason: 'revert to mid; ema rising' };
    }

    // ====== ENTRY LONG
    const longContextOk = this.params.longOnly ? (market.trendHTF !== 'down') : (this.params.contextFilter ? market.trendHTF !== 'strong_down' : true);

    if (longContextOk && (nearLower || crossedUpFromBelow) && emaRising) {
      this.lastActionBarIndex = n - 1;
      return { action: 'buy', reason: nearLower ? 'BB lower touch + EMA rising' : 'Return inside from lower band + EMA rising', confidence: 0.9 };
    }

    // ====== ENTRY SHORT (если разрешено)
    if (!this.params.longOnly) {
      const shortContextOk = this.params.contextFilter ? market.trendHTF !== 'up' : true;
      if (shortContextOk && (nearUpper || crossedDownFromAbove) && emaFalling) {
        this.lastActionBarIndex = n - 1;
        return { action: 'sell', reason: nearUpper ? 'BB upper touch + EMA falling' : 'Return inside from upper band + EMA falling', confidence: 0.9 };
      }
    }

    if (this.params.debug) {
      // eslint-disable-next-line no-console
      console.log('[EBS]', {
        price, prevPrice,
        emaNow, emaPrev, emaRising, emaFalling,
        bbUpper, bbLower, bbMid,
        atrNow, atrPct, bandWidthPct,
        trendHTF: market.trendHTF,
        regime: market.regime
      });
    }

    return { action: 'hold' };
  }
}
