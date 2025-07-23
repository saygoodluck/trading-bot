import { IStrategy, StrategyContext, SignalType } from './core/strategy.interface';
import { calculateEMA, calculateBollingerBands, getATR } from '../utils/indicators.util';

export class EmaBollingerScalpStrategy implements IStrategy {
  evaluate(context: StrategyContext): SignalType {
    const candles = context.candles;
    if (!candles || candles.length < 50) return 'hold';

    const closePrices = candles.map(c => c[4]);
    const lastCandle = candles[candles.length - 1];
    const price = lastCandle[4];

    const ema50 = calculateEMA(closePrices, 50);
    const bb = calculateBollingerBands(closePrices, 20, 2);
    const atr = getATR(candles, 14);

    const ema = ema50.at(-1);
    const bbLast = bb.at(-1);
    const atrValue = atr.at(-1);

    const position = context.position;
    const isBullish = lastCandle[4] > lastCandle[1];
    const isBearish = lastCandle[4] < lastCandle[1];

    const TP_MULT = 2;
    const SL_MULT = 1;

    if (context.debug) {
      console.log(`[EBS] price=${price.toFixed(2)}, EMA=${ema?.toFixed(2)}, BB.middle=${bbLast?.middle.toFixed(2)}, ATR=${atrValue?.toFixed(4)}`);
    }

    // === Закрытие по TP/SL ===
    if (position.type === 'long') {
      if (position.tp && price >= position.tp) {
        if (context.debug) console.log(`[TP] LONG: price ${price} >= tp ${position.tp}`);
        return 'close-long';
      }
      if (position.sl && price <= position.sl) {
        if (context.debug) console.log(`[SL] LONG: price ${price} <= sl ${position.sl}`);
        return 'close-long';
      }
    }

    if (position.type === 'short') {
      if (position.tp && price <= position.tp) {
        if (context.debug) console.log(`[TP] SHORT: price ${price} <= tp ${position.tp}`);
        return 'close-short';
      }
      if (position.sl && price >= position.sl) {
        if (context.debug) console.log(`[SL] SHORT: price ${price} >= sl ${position.sl}`);
        return 'close-short';
      }
    }

    // === Вход в позицию ===
    if (position.type === 'none' && atrValue && ema && bbLast) {
      // LONG
      if (
        price > ema &&
        lastCandle[3] <= bbLast.lower &&
        isBullish
      ) {
        const sl = price - SL_MULT * atrValue;
        const tp = price + TP_MULT * atrValue;
        context.position.sl = sl;
        context.position.tp = tp;

        if (context.debug) console.log(`[ENTRY LONG] price=${price}, sl=${sl}, tp=${tp}`);
        return 'buy';
      }

      // SHORT
      if (
        price < ema &&
        lastCandle[2] >= bbLast.upper &&
        isBearish
      ) {
        const sl = price + SL_MULT * atrValue;
        const tp = price - TP_MULT * atrValue;
        context.position.sl = sl;
        context.position.tp = tp;

        if (context.debug) console.log(`[ENTRY SHORT] price=${price}, sl=${sl}, tp=${tp}`);
        return 'short';
      }
    }

    return 'hold';
  }
}
