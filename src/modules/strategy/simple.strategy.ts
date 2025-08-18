import { Injectable } from '@nestjs/common';
import { TradingContext } from './trading-context';
import { StrategySignal, StrategySignalType } from './strategy-signal';
import { IStrategy } from './strategy.interface';

@Injectable()
export class SimpleStrategy implements IStrategy {
  evaluate({ price }: TradingContext): StrategySignal {
    return price < 60000 ? new StrategySignal(StrategySignalType.LONG) : price > 70000 ? new StrategySignal(StrategySignalType.EXIT) : new StrategySignal(StrategySignalType.HOLD);
  }

  name(): string {
    return 'simple strategy';
  }
}
