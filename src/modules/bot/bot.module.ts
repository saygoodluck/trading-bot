import { Module } from '@nestjs/common';
import { BotController } from './bot.controller';
import { EngineModule } from '../engine/engine.module';
import { StrategyModule } from '../strategy/strategy.module';
import { TelegramModule } from '../telegram/telegram.module';
import { KlineModule } from '../market/kline.module';
import { LiveRunner } from './live.runner';
import { ExecutorModule } from '../execution/executor.module';
import { StreamModule } from '../stream/stream.module';

@Module({
  imports: [KlineModule, EngineModule, StrategyModule, TelegramModule, ExecutorModule, StreamModule],
  controllers: [BotController],
  providers: [LiveRunner]
})
export class BotModule {}
