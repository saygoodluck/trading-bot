import { Module } from '@nestjs/common';
import { KlineModule } from '../market/kline.module';
import { Engine } from './engine';

@Module({
  imports: [KlineModule],
  controllers: [],
  providers: [Engine],
  exports: [Engine]
})
export class EngineModule {}
