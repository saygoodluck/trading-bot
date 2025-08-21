import { Injectable, Type } from '@nestjs/common';
import { IStrategy } from './strategy.interface';
import { EmaBollingerScalpStrategy } from './ema-bollinger-scalp.strategy';
import { StrategyParams } from '../../common/types';
import { ModuleRef } from '@nestjs/core';
import { BbEmaCombinerStrategy } from './bb-ma-combiner.strategy';
import { BbMeanRevertSimple } from './bb-mean-revert-simple.strategy';

@Injectable()
export class StrategiesRegistry {
  private readonly registry: Record<string, Type<IStrategy>> = {
    EmaBollingerScalpStrategy,
    BbEmaCombinerStrategy,
    BbMeanRevertSimple
  };

  constructor(private readonly moduleRef: ModuleRef) {}

  async build(name: string, params?: StrategyParams): Promise<IStrategy> {
    const Ctor = this.registry[name];
    if (!Ctor) {
      throw new Error(`Strategy '${name}' not found. Known: ${Object.keys(this.registry).join(', ')}`);
    }
    // создаём новый экземпляр через Nest DI (учитывает scope: TRANSIENT)
    const strategy = await this.moduleRef.create(Ctor);
    if (params) strategy.params = { ...strategy.params, ...params };
    return strategy;
  }

  list(): string[] {
    return Object.keys(this.registry);
  }
}
