import { Module } from '@nestjs/common';
import { StrategiesRegistry } from './strategies.registry';

@Module({
  providers: [StrategiesRegistry],
  exports: [StrategiesRegistry]
})
export class StrategyModule {}
