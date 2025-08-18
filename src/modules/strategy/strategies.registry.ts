import { Injectable } from '@nestjs/common';
import { IStrategy } from './strategy.interface';
import { EmaBollingerScalpStrategy } from './ema-bollinger-scalp.strategy';


@Injectable()
export class StrategiesRegistry {
  private registry: Record<string, (params?: StrategyParams) => IStrategy> = {};

  constructor(private emaBollingerScalp: EmaBollingerScalpStrategy) {
    this.registry['SmaRsiStrategy'] = (params?: StrategyParams) => {
      const s = new EmaBollingerScalpStrategy();
      if (params) s.params = { ...s.params, ...params };
      return s;
    };
  }

  build(name: string, params?: StrategyParams): IStrategy {
    const b = this.registry[name];
    if (!b) throw new Error(`Strategy '${name}' not found`);
    return b(params);
  }

  list(): string[] { return Object.keys(this.registry); }
}
