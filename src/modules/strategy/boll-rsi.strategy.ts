import { Injectable, Logger } from '@nestjs/common';
import { IStrategy, SignalType, StrategyContext } from './core/strategy.interface';
import { getRSI, getSMA } from '../utils/indicators.util';

@Injectable()
export class BollRsiStrategy implements IStrategy {
  private readonly logger = new Logger(BollRsiStrategy.name);

  evaluate(context: StrategyContext): SignalType {
    const closes = context.candles.map((c) => c[4]);
    if (closes.length < 20) return 'hold';

    const sma = getSMA(closes, 20);
    const rsi = getRSI(closes, 14);
    const std = this.getStdDev(closes, 20);
    const lastClose = closes[closes.length - 1];

    const upper = sma[sma.length - 1] + 2 * std;
    const lower = sma[sma.length - 1] - 2 * std;
    const lastRSI = rsi[rsi.length - 1];

    if (context.debug) {
      this.logger.log(
        `[${context.symbol}] price=${lastClose}, Upper=${upper.toFixed(2)}, Lower=${lower.toFixed(2)}, RSI=${lastRSI?.toFixed(2)}`
      );
    }

    // 30:70
    // 50:50
    if (lastClose < lower && lastRSI < 50) return 'buy';
    if (lastClose > upper && lastRSI > 50) return 'sell';

    return 'hold';
  }

  private getStdDev(values: number[], period: number): number {
    const slice = values.slice(-period);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / period;
    return Math.sqrt(variance);
  }
}
