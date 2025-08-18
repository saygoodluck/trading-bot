import { Context } from './trading-context';
import { Signal } from './strategy-signal';

export interface IStrategy {
  evaluate(ctx: Context): Signal;

  name(): string;
}
