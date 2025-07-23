import { Injectable, Logger } from '@nestjs/common';
import { IStrategy, SignalType, StrategyContext } from './core/strategy.interface';
import { getRSI, getSMA } from '../utils/indicators.util';

@Injectable()
export class SmaRsiStrategy implements IStrategy {
  private readonly logger = new Logger(SmaRsiStrategy.name);

  evaluate(context: StrategyContext): SignalType {
    const closes = context.candles.map((c) => c[4]);
    if (closes.length < 30) return 'hold';

    const sma10 = getSMA(closes, 10);
    const sma30 = getSMA(closes, 30);
    const rsi = getRSI(closes, 14);

    const len = sma10.length;
    const len30 = sma30.length;
    const rsiLen = rsi.length;

    if (len < 2 || len30 < 2 || rsiLen < 1) return 'hold';

    const prevSma10 = sma10[len - 2];
    const currSma10 = sma10[len - 1];
    const prevSma30 = sma30[len30 - 2];
    const currSma30 = sma30[len30 - 1];
    const lastRSI = rsi[rsiLen - 1];

    const prevCross = prevSma10 - prevSma30;
    const currCross = currSma10 - currSma30;

    if (context.debug) {
      this.logger.log(
        `[${context.symbol}] price=${context.price}, SMA10=${currSma10?.toFixed(2)}, SMA30=${currSma30?.toFixed(2)}, RSI=${lastRSI?.toFixed(2)}`
      );
    }

    if ((prevCross <= 0 && currCross > 0) || currCross > 0.5) {
      if (lastRSI < 75) return 'buy';
    }

    if ((prevCross >= 0 && currCross < 0) || currCross < -0.5) {
      if (lastRSI > 25) return 'sell';
    }

    return 'hold';
  }
}
