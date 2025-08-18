import { ATR, EMA, RSI, SMA } from 'technicalindicators';
import { Candle } from '../modules/market/candle';

export function getSMA(data: number[], period: number): number[] {
  return SMA.calculate({ values: data, period });
}

export function getEMA(data: number[], period: number): number[] {
  return EMA.calculate({ values: data, period });
}

export function calculateEMA(prices: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const ema: number[] = [];

  let prevEma = prices.slice(0, period).reduce((a, b) => a + b, 0) / period; // SMA для старта
  ema[period - 1] = prevEma;

  for (let i = period; i < prices.length; i++) {
    const price = prices[i];
    const currentEma = price * k + prevEma * (1 - k);
    ema.push(currentEma);
    prevEma = currentEma;
  }

  // добавляем undefined в начало массива для выравнивания длины
  const padded = new Array(period - 1).fill(undefined as any).concat(ema);
  return padded;
}

export function calculateBollingerBands(
  prices: number[],
  period: number = 20,
  stdDevMultiplier: number = 2
): {
  lower: number;
  upper: number;
  middle: number;
}[] {
  const bands: { lower: number; upper: number; middle: number }[] = [];

  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) {
      bands.push({ lower: NaN, upper: NaN, middle: NaN });
      continue;
    }

    const slice = prices.slice(i - period + 1, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / period;
    const stdDev = Math.sqrt(variance);

    bands.push({
      lower: mean - stdDevMultiplier * stdDev,
      upper: mean + stdDevMultiplier * stdDev,
      middle: mean
    });
  }

  return bands;
}

export function getATR(candles: Candle[], period: number): number[] {
  const input = {
    high: candles.map((c) => c.high),
    low: candles.map((c) => c.low),
    close: candles.map((c) => c.close),
    period
  };

  return ATR.calculate(input);
}

export function getRSI(data: number[], period: number): number[] {
  return RSI.calculate({ values: data, period });
}

export function getHullMA(data: number[], length: number): number[] {
  if (data.length < length) return new Array(data.length).fill(0);

  const halfLength = Math.floor(length / 2);
  const sqrtLength = Math.round(Math.sqrt(length));

  const wma1 = calculateWMA(data, length);
  const wma2 = calculateWMA(data, halfLength);

  const rawHull = wma2.map((val, idx) => 2 * val - (wma1[idx] || 0));
  const hullMA = calculateWMA(rawHull, sqrtLength);

  return hullMA;
}

export function getVWAP(candles: Candle[]): number[] {
  const vwap: number[] = [];
  let cumulativeTPV = 0;
  let cumulativeVolume = 0;

  for (const candle of candles) {
    const { high, low, close, volume } = candle;
    const typicalPrice = (high + low + close) / 3;
    const tpv = typicalPrice * volume;

    cumulativeTPV += tpv;
    cumulativeVolume += volume;

    vwap.push(cumulativeVolume === 0 ? NaN : cumulativeTPV / cumulativeVolume);
  }

  return vwap;
}

function calculateWMA(data: number[], period: number): number[] {
  const weights = Array.from({ length: period }, (_, i) => i + 1);
  const sumWeights = weights.reduce((a, b) => a + b, 0);

  return data.map((_, idx) => {
    if (idx < period - 1) return 0;

    let sum = 0;
    for (let i = 0; i < period; i++) {
      sum += data[idx - i] * weights[i];
    }

    return sum / sumWeights;
  });
}

// 1. Конвертация в старший таймфрейм
export function getHigherTimeframeCandles(candles: Candle[], targetTimeframe: string): Candle[] {
  if (candles.length === 0) {
    return [];
  }

  const timeframeMap: Record<string, number> = {
    '1m': 1,
    '5m': 5,
    '15m': 15,
    '30m': 30,
    '1h': 60,
    '4h': 240,
    '1d': 1440
  };

  const first = candles[0];
  const second = candles[1];
  const currentIntervalMs = second.timestamp - first.timestamp;
  const targetMinutes = timeframeMap[targetTimeframe];
  if (!targetMinutes) {
    throw new Error(`Unsupported timeframe: ${targetTimeframe}`);
  }

  const ratio = targetMinutes / (currentIntervalMs / 60000);
  if (ratio < 1) {
    return candles;
  }

  const higherTF: Candle[] = [];
  let temp: Candle | null = null;
  let count = 0;

  for (const candle of candles) {
    const { timestamp, open, high, low, close, volume } = candle;

    if (temp === null) {
      // начинаем накапливать новую свечу
      temp = { timestamp, open, high, low, close, volume };
      count = 1;
      continue;
    }

    // обновляем high/low
    temp.high = Math.max(temp.high, high);
    temp.low = Math.min(temp.low, low);
    // всегда берем close последней свечи
    temp.close = close;
    // суммируем объём
    temp.volume += volume;

    count++;
    if (count >= ratio) {
      higherTF.push(temp);
      temp = null;
    }
  }

  // докидываем неполную свечу в конце
  if (temp !== null) {
    higherTF.push(temp);
  }

  return higherTF;
}

// 2. Обнаружение дивергенции (RSI)
export function detectDivergence(candles: Candle[], sourceTimeframe: string): 'bullish' | 'bearish' | null {
  if (candles.length < 50) return null;

  // Получаем данные для анализа
  const closes = candles.map((c) => c[4]);
  const rsiPeriod = sourceTimeframe === '1m' ? 14 : 10;
  const rsiValues = getRSI(closes, rsiPeriod);

  // Находим экстремумы на графике цены
  const pricePeaks = findPeaks(closes, 5, true);
  const priceValleys = findPeaks(closes, 5, false);

  // Находим экстремумы на RSI
  const rsiPeaks = findPeaks(rsiValues, 5, true);
  const rsiValleys = findPeaks(rsiValues, 5, false);

  // Бычья дивергенция (цена делает новые минимумы, RSI - нет)
  for (let i = 1; i < priceValleys.length; i++) {
    const currentValley = priceValleys[i];
    const prevValley = priceValleys[i - 1];

    if (currentValley.value < prevValley.value) {
      const currentRSI = findNearestValley(rsiValleys, currentValley.index);
      const prevRSI = findNearestValley(rsiValleys, prevValley.index);

      if (currentRSI && prevRSI && currentRSI.value > prevRSI.value) {
        return 'bullish';
      }
    }
  }

  // Медвежья дивергенция (цена делает новые максимумы, RSI - нет)
  for (let i = 1; i < pricePeaks.length; i++) {
    const currentPeak = pricePeaks[i];
    const prevPeak = pricePeaks[i - 1];

    if (currentPeak.value > prevPeak.value) {
      const currentRSI = findNearestPeak(rsiPeaks, currentPeak.index);
      const prevRSI = findNearestPeak(rsiPeaks, prevPeak.index);

      if (currentRSI && prevRSI && currentRSI.value < prevRSI.value) {
        return 'bearish';
      }
    }
  }

  return null;
}

// Вспомогательные функции для поиска экстремумов
function findPeaks(data: number[], lookback: number, findMax: boolean): { index: number; value: number }[] {
  const peaks: { index: number; value: number }[] = [];

  for (let i = lookback; i < data.length - lookback; i++) {
    let isPeak = true;

    for (let j = 1; j <= lookback; j++) {
      if (findMax) {
        if (data[i] < data[i - j] || data[i] < data[i + j]) {
          isPeak = false;
          break;
        }
      } else {
        if (data[i] > data[i - j] || data[i] > data[i + j]) {
          isPeak = false;
          break;
        }
      }
    }

    if (isPeak) {
      peaks.push({ index: i, value: data[i] });
    }
  }

  return peaks;
}

function findNearestPeak(peaks: { index: number; value: number }[], targetIndex: number) {
  if (peaks.length === 0) return null;
  return peaks.reduce((nearest, peak) => (Math.abs(peak.index - targetIndex) < Math.abs(nearest.index - targetIndex) ? peak : nearest));
}

function findNearestValley(valleys: { index: number; value: number }[], targetIndex: number) {
  return findNearestPeak(valleys, targetIndex);
}

// 3. Поиск зон ликвидности
export function findLiquidityZones(candles: Candle[], sensitivity: number = 1): { high: number[]; low: number[] } {
  const highs: number[] = [];
  const lows: number[] = [];
  const swingPoints = findSwingPoints(candles);

  const baseThreshold = 0.003;
  const mergeThreshold = baseThreshold * (1 / sensitivity);

  // Собираем все значимые экстремумы
  swingPoints.forEach((point, i) => {
    if (point.type === 'high') {
      // Фильтрация: оставляем только значимые уровни
      if (i > 0 && i < swingPoints.length - 1) {
        const isSignificant = point.value > swingPoints[i - 1].value && point.value > swingPoints[i + 1].value;

        if (isSignificant) {
          highs.push(point.value);
        }
      }
    } else {
      if (i > 0 && i < swingPoints.length - 1) {
        const isSignificant = point.value < swingPoints[i - 1].value && point.value < swingPoints[i + 1].value;

        if (isSignificant) {
          lows.push(point.value);
        }
      }
    }
  });

  // Группируем близкие уровни
  const mergedHighs = mergeLevels(highs, mergeThreshold);
  const mergedLows = mergeLevels(lows, mergeThreshold);

  return {
    high: mergedHighs.sort((a, b) => b - a),
    low: mergedLows.sort((a, b) => a - b)
  };
}

function findSwingPoints(candles: Candle[], lookback = 3) {
  const swingPoints: { index: number; value: number; type: 'high' | 'low' }[] = [];

  for (let i = lookback; i < candles.length - lookback; i++) {
    const candle = candles[i];
    let isHigh = true;
    let isLow = true;

    // Проверяем high
    for (let j = 1; j <= lookback; j++) {
      if (candle[2] < candles[i - j][2] || candle[2] < candles[i + j][2]) {
        isHigh = false;
      }
    }

    // Проверяем low
    for (let j = 1; j <= lookback; j++) {
      if (candle[3] > candles[i - j][3] || candle[3] > candles[i + j][3]) {
        isLow = false;
      }
    }

    if (isHigh) swingPoints.push({ index: i, value: candle[2], type: 'high' });
    if (isLow) swingPoints.push({ index: i, value: candle[3], type: 'low' });
  }

  return swingPoints;
}

function mergeLevels(levels: number[], threshold: number): number[] {
  const merged: number[] = [];

  levels
    .sort((a, b) => a - b)
    .forEach((level) => {
      const found = merged.find((l) => Math.abs(l - level) / level < threshold);
      if (!found) merged.push(level);
    });

  return merged;
}

// 4. Поиск ордерблоков
export function findOrderBlocks(candles: Candle[]): { bullish: Candle[]; bearish: Candle[] } {
  const bullishBlocks: Candle[] = [];
  const bearishBlocks: Candle[] = [];

  for (let i = 2; i < candles.length - 1; i++) {
    const current = candles[i];
    const next = candles[i + 1];

    // Бычий ордерблок: восходящая свеча с закрытием в верхней трети
    if (current[4] > current[1] && current[4] - current[3] > 2 * (current[2] - current[4]) && next[4] > next[1] && next[4] > current[4]) {
      bullishBlocks.push(current);
    }

    // Медвежий ордерблок: нисходящая свеча с закрытием в нижней трети
    if (current[4] < current[1] && current[2] - current[4] > 2 * (current[4] - current[3]) && next[4] < next[1] && next[4] < current[4]) {
      bearishBlocks.push(current);
    }
  }

  return { bullish: bullishBlocks, bearish: bearishBlocks };
}

// 5. Расчет риск/прибыль
export function calculateRiskReward(signal: 'buy' | 'sell', entryPrice: number, stopLossLevel: number, takeProfitLevel?: number): number {
  const risk = Math.abs(entryPrice - stopLossLevel);

  // Если TP не указан, используем стандартное соотношение 1:3
  if (!takeProfitLevel) {
    return signal === 'buy' ? (entryPrice + 3 * risk - entryPrice) / risk : (entryPrice - (entryPrice - 3 * risk)) / risk;
  }

  const reward = Math.abs(entryPrice - takeProfitLevel);

  // Защита от деления на ноль
  if (risk === 0) return 0;

  return reward / risk;
}

// 6. Дополнительно: Поиск FVG (Fair Value Gaps)
export function findFVGs(candles: Candle[]): { bullish: Candle[][]; bearish: Candle[][] } {
  const bullishGaps: Candle[][] = [];
  const bearishGaps: Candle[][] = [];

  for (let i = 1; i < candles.length - 1; i++) {
    const prev = candles[i - 1];
    const current = candles[i];
    const next = candles[i + 1];

    // Бычий FVG (медвежья свеча, затем бычья)
    if (prev[4] < prev[1] && current[4] > current[1]) {
      // Проверяем наличие gap
      if (current[3] > prev[2]) {
        bullishGaps.push([prev, current, next]);
      }
    }

    // Медвежий FVG (бычья свеча, затем медвежья)
    if (prev[4] > prev[1] && current[4] < current[1]) {
      // Проверяем наличие gap
      if (current[2] < prev[3]) {
        bearishGaps.push([prev, current, next]);
      }
    }
  }

  return { bullish: bullishGaps, bearish: bearishGaps };
}

// Дополнительные утилиты для работы с массивами
declare global {
  interface Array<T> {
    last(): T;
  }
}

Array.prototype.last = function <T>(this: T[]): T {
  return this[this.length - 1];
};
