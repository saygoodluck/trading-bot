import { Injectable, Logger } from '@nestjs/common';
import { IStrategy, SignalType, StrategyContext } from './core/strategy.interface';
import { getEMA, getRSI, getSMA, getATR, getVWAP } from '../utils/indicators.util';

@Injectable()
export class SwingRsiSmaStrategy implements IStrategy {
  private readonly logger = new Logger(SwingRsiSmaStrategy.name);
  private positionState: {
    entryPrice: number;
    peakPrice: number;
    atr: number;
  } | null = null;

  evaluate(context: StrategyContext): SignalType {
    const { candles, position, debug, timeframe, symbol, indicators } = context;
    const closes = candles.map(c => c[4]);
    const highs = candles.map(c => c[2]);
    const lows = candles.map(c => c[3]);
    const volumes = candles.map(c => c[5]);
    const currentClose = closes.at(-1)!;

    const scale = this.getTimeframeScale(timeframe);
    const rsiPeriod = Math.round(14 * scale);
    const smaPeriod = Math.round(30 * scale);
    const emaPeriod = Math.round(10 * scale);
    const atrPeriod = Math.round(14 * scale);
    const minCandles = Math.max(50, smaPeriod + 10);
    if (candles.length < minCandles) return 'hold';

    const sma = getSMA(closes, smaPeriod);
    const ema = getEMA(closes, emaPeriod);
    const rsi = getRSI(closes, rsiPeriod);
    const atr = getATR(candles, atrPeriod);
    const volumeSMA = getSMA(volumes, 14);
    const vwap = getVWAP(candles);

    if (!sma || !ema || !rsi || !atr || !volumeSMA || !vwap) return 'hold';

    const lastSMA = sma.at(-1)!;
    const lastEMA = ema.at(-1)!;
    const lastRSI = rsi.at(-1)!;
    const lastATR = atr.at(-1)!;
    const lastVWAP = vwap.at(-1)!;
    const lastVolume = volumes.at(-1)!;
    const avgVolume = volumeSMA.at(-1)!;
    const volumeRatio = lastVolume / avgVolume;

    const recentHighs = highs.slice(-6);
    const recentLows = lows.slice(-6);
    const maxHigh = Math.max(...recentHighs);
    const minLow = Math.min(...recentLows);

    const swingHigh = currentClose >= maxHigh * 0.997;
    const swingLow = currentClose <= minLow * 1.003;

    const mildTrendUp = lastEMA > lastSMA * 0.997;
    const mildTrendDown = lastEMA < lastSMA * 1.003;

    // === HTF фильтр ===
    const htfEma50 = indicators?.htfEma50 as number | undefined;
    const htfTrendOk = htfEma50
      ? (position.type === 'none' && ((currentClose > htfEma50 && mildTrendUp) || (currentClose < htfEma50 && mildTrendDown)))
      : true;

    // === ENTRY ===
    if (position.type === 'none') {
      if (volumeRatio > 1.3 && htfTrendOk) {
        if (swingLow && mildTrendUp && lastRSI > 40 && lastRSI < 65 && currentClose > lastVWAP * 0.98) {
          this.positionState = { entryPrice: currentClose, peakPrice: currentClose, atr: lastATR };
          if (debug) this.logger.debug(`[ENTRY] BUY | ${symbol} ${timeframe} @ ${currentClose}`);
          return 'buy';
        }
        if (swingHigh && mildTrendDown && lastRSI < 60 && lastRSI > 35 && currentClose < lastVWAP * 1.02) {
          this.positionState = { entryPrice: currentClose, peakPrice: currentClose, atr: lastATR };
          if (debug) this.logger.debug(`[ENTRY] SELL | ${symbol} ${timeframe} @ ${currentClose}`);
          return 'sell';
        }
      }
    }

    // === EXIT ===
    if (position.type !== 'none' && this.positionState) {
      const { entryPrice, atr } = this.positionState;
      const profitPct = (currentClose - entryPrice) / entryPrice * 100 * (position.type === 'long' ? 1 : -1);

      if (position.type === 'long') {
        this.positionState.peakPrice = Math.max(this.positionState.peakPrice, currentClose);
        const trailingStop = this.positionState.peakPrice - 1.5 * atr;
        if (currentClose < trailingStop || profitPct >= 2.0 || lastRSI > 70) {
          if (debug) this.logger.debug(`[EXIT] close-long | PnL ${profitPct.toFixed(2)}%`);
          this.positionState = null;
          return 'close-long';
        }
      }

      if (position.type === 'short') {
        this.positionState.peakPrice = Math.min(this.positionState.peakPrice, currentClose);
        const trailingStop = this.positionState.peakPrice + 1.5 * atr;
        if (currentClose > trailingStop || profitPct >= 2.0 || lastRSI < 30) {
          if (debug) this.logger.debug(`[EXIT] close-short | PnL ${profitPct.toFixed(2)}%`);
          this.positionState = null;
          return 'close-short';
        }
      }
    }

    if (debug) {
      const swing = swingHigh ? 'HIGH' : swingLow ? 'LOW' : '-';
      this.logger.debug(
        `[${symbol} ${timeframe}] Price: ${currentClose.toFixed(2)} | SMA: ${lastSMA.toFixed(2)} | EMA: ${lastEMA.toFixed(2)} | RSI: ${lastRSI.toFixed(1)} | VWAP: ${lastVWAP.toFixed(2)} | Swing: ${swing} | Pos: ${position.type}`
      );
    }

    return 'hold';
  }

  private getTimeframeScale(timeframe: string): number {
    const scale: Record<string, number> = {
      '5m': 0.3,
      '15m': 0.5,
      '30m': 0.7,
      '1h': 1.0,
      '4h': 2.0,
      '1d': 4.0
    };
    return scale[timeframe] ?? 1.0;
  }
}