import { Injectable } from '@nestjs/common';
import { IStrategy, SignalType, StrategyContext } from './core/strategy.interface';

@Injectable()
export class SimpleStrategy implements IStrategy {
  evaluate({ price }: StrategyContext): SignalType {
    return price < 60000 ? 'buy' : price > 70000 ? 'sell' : 'hold';
  }
}
