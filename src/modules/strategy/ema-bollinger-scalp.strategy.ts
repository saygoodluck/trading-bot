import { Signal, SignalAction } from './strategy-signal';
import { ATR, EMA } from '../../common/utils/indicators';
import { IStrategy } from './strategy.interface';
import { Context } from './trading-context';
import { StrategyParams } from '../../common/types';

export class EmaBollingerScalpStrategy implements IStrategy {
  name() {
    return 'EmaBollingerScalpStrategy';
  }

  // Параметры под твой старый смысл, но теперь всё через params
  params: StrategyParams = {
    emaPeriod: 20,
    bbPeriod: 20,
    bbMult: 2,
    atrPeriod: 14,
    longOnly: true, // фильтр по направлению
    contextFilter: true, // учитывать market.trendHTF
    debug: false
  };

  evaluate(ctx: Context): Signal {
    const { candles, market } = ctx;
    if (!candles || candles.length < 60) return { action: SignalAction.HOLD };

    // данные
    const closes = candles.map((c) => c.close);
    const price = closes[closes.length - 1];

    const emaArr = EMA(closes, Number(this.params.emaPeriod));
    const emaNow = emaArr[emaArr.length - 1];
    const emaPrev2 = emaArr[emaArr.length - 3]; // для «наклона» EMA

    // Bollinger по последним N
    const bbP = Number(this.params.bbPeriod);
    const bbM = Number(this.params.bbMult);
    if (closes.length < bbP + 2) return { action: SignalAction.HOLD };

    const slice = closes.slice(-bbP);
    const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
    const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / slice.length;
    const stdev = Math.sqrt(variance);
    const bbUpper = mean + bbM * stdev;
    const bbLower = mean - bbM * stdev;

    // ATR для «здравого смысла» (волатильность/режим)
    const atrArr = ATR(candles, Number(this.params.atrPeriod));
    const atrNow = atrArr[atrArr.length - 1];

    // фильтры
    const emaRising = emaNow > emaPrev2;
    const emaFalling = emaNow < emaPrev2;

    if (this.params.contextFilter) {
      // Не лезем против HTF
      if (this.params.longOnly) {
        if (market.trendHTF === 'down') return { action: SignalAction.HOLD };
      } else {
        // обе стороны ок; просто учитываем режим
      }
    }

    // ====== EXIT (мягкая логика, «закрыть если спринг/сжатие прошло»)
    // Стратегия не знает про позицию, но close безопасен: Engine закроет только если позиция есть.
    // Закрываем, если цена вернулась к середине/против EMA-наклона.
    const bbMid = mean;
    if (price > bbMid && emaFalling) return { action: SignalAction.CLOSE, reason: 'price>mid && ema falling' };
    if (price < bbMid && emaRising) return { action: SignalAction.CLOSE, reason: 'price<mid && ema rising' };

    // ====== ENTRY
    // LONG: цена у нижней полосы + EMA растёт + (опц.) тренд HTF вверх
    if ((this.params.longOnly ? market.trendHTF !== 'down' : true) && price <= bbLower * 1.005 && emaRising) {
      return { action: SignalAction.BUY, reason: 'BB lower touch + EMA rising', confidence: 0.9 };
    }

    // SHORT: цена у верхней полосы + EMA падает + (опц.) тренд HTF вниз (если не longOnly)
    if (!this.params.longOnly && (this.params.contextFilter ? market.trendHTF !== 'up' : true) && price >= bbUpper * 0.995 && emaFalling) {
      return { action: SignalAction.SELL, reason: 'BB upper touch + EMA falling', confidence: 0.9 };
    }

    // Ничего умного не произошло
    if (this.params.debug) {
      // минимальный лог (можно расширить)
      // eslint-disable-next-line no-console
      console.log('[EBS]', {
        price,
        emaNow,
        bbUpper,
        bbLower,
        atrNow,
        trendHTF: market.trendHTF,
        regime: market.regime
      });
    }

    return { action: SignalAction.HOLD };
  }
}
