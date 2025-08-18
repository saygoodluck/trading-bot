import { Candle } from '../../common/types';

export function SMA(values: number[], period: number): number[] {
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    out.push(i >= period - 1 ? sum / period : NaN);
  }
  return out;
}

export function EMA(values: number[], period: number): number[] {
  const out: number[] = [];
  const k = 2 / (period + 1);
  let ema = values[0];
  for (let i = 0; i < values.length; i++) {
    if (i === 0) {
      out.push(values[0]);
    } else {
      ema = values[i] * k + ema * (1 - k);
      out.push(ema);
    }
  }
  return out;
}

export function RSI(values: number[], period: number): number[] {
  const out: number[] = [];
  let gains = 0, losses = 0;
  for (let i = 1; i < values.length; i++) {
    const change = values[i] - values[i-1];
    if (i <= period) {
      if (change > 0) gains += change; else losses -= change;
      if (i === period) {
        const avgGain = gains / period;
        const avgLoss = losses / period;
        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        out.push(100 - 100 / (1 + rs));
      } else {
        out.push(NaN);
      }
    } else {
      // const prevRsi = out[out.length - 1];
      const gain = Math.max(change, 0);
      const loss = Math.max(-change, 0);
      gains = (gains * (period - 1) + gain) / period;
      losses = (losses * (period - 1) + loss) / period;
      const rs = losses === 0 ? 100 : gains / losses;
      out.push(100 - 100 / (1 + rs));
    }
  }
  // prepend a NaN to match input length
  return [NaN, ...out];
}

export function ATR(candles: Candle[], period: number): number[] {
  const out: number[] = [];
  let atr = 0;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const prev = i > 0 ? candles[i-1] : c;
    const tr = Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close));
    if (i === 0) {
      atr = tr;
      out.push(tr);
    } else {
      atr = (atr * (period - 1) + tr) / period;
      out.push(atr);
    }
  }
  return out;
}
