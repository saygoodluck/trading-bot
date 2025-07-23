import { Injectable, Logger } from '@nestjs/common';
import { IStrategy, SignalType, StrategyContext } from './core/strategy.interface';
import { getEMA, getHullMA, getRSI, getSMA } from '../utils/indicators.util';

@Injectable()
export class VolumeImpulseStrategy implements IStrategy {
  private readonly logger = new Logger(VolumeImpulseStrategy.name);
  private cumulativeImpact = 0;
  private lastVolumeSpike = 0;

  // Оптимизированные параметры для мультитаймфрейм тестирования
  private readonly lookbackPeriod = 12;
  private readonly volumeThreshold = 1.8;
  private readonly impactDecay = 0.85;
  private readonly hullLength = 12;
  private readonly emaLength = 6;
  private readonly rsiLength = 10;
  private readonly maxTradeDuration = 18;

  evaluate(context: StrategyContext): SignalType {
    const { candles, position, debug } = context;
    const currentCandle = candles[candles.length - 1];
    const currentPrice = currentCandle[4];

    // Проверка минимального количества свечей
    if (candles.length < Math.max(this.lookbackPeriod * 2, 50)) {
      return 'hold';
    }

    // 1. Анализ объемов (с защитой от недостатка данных)
    const volumes = candles.map(c => c[5]);
    const closes = candles.map(c => c[4]);
    const opens = candles.map(c => c[1]);

    const smaVolumes = getSMA(volumes, this.lookbackPeriod);
    if (!smaVolumes || smaVolumes.length < 2) return 'hold';

    const currentVolume = volumes[volumes.length - 1];
    const avgVolume = smaVolumes[smaVolumes.length - 1];
    const volumeRatio = currentVolume / avgVolume;

    // Обновление кумулятивного импульса
    if (volumeRatio > this.volumeThreshold) {
      const isBullish = closes[closes.length - 1] > opens[opens.length - 1];
      const impactPower = Math.min(volumeRatio / 6, 3.0); // Увеличено влияние объема
      const blockImpact = (isBullish ? 1 : -1) * impactPower;

      this.cumulativeImpact = this.cumulativeImpact * this.impactDecay + blockImpact;
      this.lastVolumeSpike = candles.length; // Запоминаем свечу с объемным импульсом
    } else {
      this.cumulativeImpact *= this.impactDecay;
    }

    // 2. Расчет индикаторов
    const hullMA = getHullMA(closes, this.hullLength);
    const ema = getEMA(closes, this.emaLength);
    const rsi = getRSI(closes, this.rsiLength);

    // Проверка наличия данных индикаторов
    if (!hullMA || !ema || !rsi ||
      hullMA.length < 2 || ema.length < 2 || rsi.length < 1) {
      return 'hold';
    }

    const lastHull = hullMA[hullMA.length - 1];
    const prevHull = hullMA[hullMA.length - 2];
    const lastEma = ema[ema.length - 1];
    const prevEma = ema[ema.length - 2];
    const lastRsi = rsi[rsi.length - 1];

    // 3. Условия входа
    const trendUp = lastEma > lastHull && lastEma > prevEma;
    const emaCrossUp = lastEma > lastHull && prevEma <= prevHull;
    const impactBreakout = this.cumulativeImpact > 0.3;
    const rsiValid = lastRsi < 55 && lastRsi > 22;

    // 4. Условия выхода
    let shouldExit = false;
    if (position.type === 'long') {
      const profitPct = (currentPrice - position.entryPrice) / position.entryPrice * 100;

      // Условия выхода:
      const timeExit = candles.length - position.entryCandleIndex > this.maxTradeDuration;
      const emaCrossDown = lastEma < lastHull && prevEma >= prevHull;
      const impactReversal = this.cumulativeImpact < -0.15;
      const rsiOverbought = lastRsi > 70;
      const stopLoss = profitPct < -0.8;
      const takeProfit = profitPct > 1.8;

      shouldExit = timeExit || emaCrossDown || impactReversal || rsiOverbought || stopLoss || takeProfit;
    }

    // Отладочная информация
    if (debug) {
      this.logger.debug(
        `[${context.symbol}] Price: ${currentPrice.toFixed(2)} | ` +
        `Impact: ${this.cumulativeImpact.toFixed(2)} | ` +
        `EMA/Hull: ${lastEma.toFixed(2)}/${lastHull.toFixed(2)} | ` +
        `RSI: ${lastRsi.toFixed(1)} | VolRatio: ${volumeRatio.toFixed(1)}x`
      );
    }

    // Логика сигналов
    if (position.type === 'none' && impactBreakout && trendUp && rsiValid) {
      // Дополнительная проверка свежести объемного импульса
      const volumeSpikeRecent = (candles.length - this.lastVolumeSpike) <= 3;

      if (emaCrossUp || volumeSpikeRecent) {
        return 'buy';
      }
    }

    if (shouldExit && position.type === 'long') {
      return 'close-long';
    }

    return 'hold';
  }
}