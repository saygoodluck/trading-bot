import { Module, Provider } from '@nestjs/common';
import { EmaBollingerScalpStrategy } from './ema-bollinger-scalp.strategy';

const strategies = [EmaBollingerScalpStrategy];

const strategyProvider: Provider = {
  provide: 'STRATEGIES',
  useFactory: (...instances) => instances,
  inject: strategies
};

@Module({
  providers: [...strategies, strategyProvider],
  exports: ['STRATEGIES']
})
export class StrategyModule {}
