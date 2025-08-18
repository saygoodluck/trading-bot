import { Injectable } from '@nestjs/common';
import { Context } from './trading-context';
import { Signal, SignalAction } from './strategy-signal';
import { IStrategy } from './strategy.interface';

@Injectable()
export class SimpleStrategy implements IStrategy {
  evaluate(ctx: Context): Signal {
    const price = ctx.candles[ctx.candles.length - 1].close;
    return price < 60000
      ? { action: SignalAction.BUY }
      : price > 70000
        ? { action: SignalAction.CLOSE }
        : { action: SignalAction.HOLD };
  }

  name(): string {
    return 'simple strategy';
  }
}
