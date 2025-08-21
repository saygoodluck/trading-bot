import { Signal } from './strategy-signal';
import { Context, StrategyParams } from '../../common/types';

export interface IStrategy {
  evaluate(ctx: Context): Signal;
  params: StrategyParams;
}
