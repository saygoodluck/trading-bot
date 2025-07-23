import { IStrategy, SignalType, StrategyContext } from './core/strategy.interface';
import { Injectable } from '@nestjs/common';
import { getATR, getEMA, getRSI, getSMA } from '../utils/indicators.util';

@Injectable()
export class IntradayEthStrategy implements IStrategy {
  evaluate(context: StrategyContext): SignalType {
    const { candles, position, debug } = context;
    const closes = candles.map(c => c[4]);
    const volumes = candles.map(c => c[5]);

    // Индикаторы
    const emaFast = getEMA(closes, 9);
    const emaSlow = getEMA(closes, 21);
    const volumeSMA = getSMA(volumes, 14);
    const rsi = getRSI(closes, 12);
    const atr = getATR(candles, 14);

    // Проверка готовности данных
    if (emaFast.length < 2 || emaSlow.length < 2 || !volumeSMA || !rsi || !atr)
      return 'hold';

    // Текущие значения
    const price = closes[closes.length - 1];
    const volumeRatio = volumes[volumes.length - 1] / volumeSMA[volumeSMA.length - 1];

    // Условия входа
    const trendUp = emaFast[emaFast.length - 1] > emaSlow[emaSlow.length - 1];
    const trendDown = emaFast[emaFast.length - 1] < emaSlow[emaSlow.length - 1];

    if (position.type === 'none') {
      // LONG
      if (trendUp && volumeRatio > 1.8 && rsi[rsi.length - 1] > 45) {
        return 'buy';
      }
      // SHORT
      if (trendDown && volumeRatio > 2.0 && rsi[rsi.length - 1] < 55) {
        return 'sell';
      }
    }

    // Управление позицией
    if (position.type === 'long') {
      const profit = (price - position.entryPrice) / position.entryPrice * 100;
      if (profit >= 1.5 || rsi[rsi.length - 1] > 75 || volumeRatio < 0.8) {
        return 'close-long';
      }
    }

    if (position.type === 'short') {
      const profit = (position.entryPrice - price) / position.entryPrice * 100;
      if (profit >= 1.5 || rsi[rsi.length - 1] < 25 || volumeRatio < 0.8) {
        return 'close-short';
      }
    }

    return 'hold';
  }
}