import { Module } from '@nestjs/common';
import { BotController } from './bot.controller';
import { TraderModule } from '../engine/trader.module';
import { StrategyModule } from '../strategy/strategy.module';
import { TelegramModule } from '../telegram/telegram.module';
import { MarketModule } from '../market/market.module';
import { LiveRunner } from './live.runner';

@Module({
  imports: [MarketModule, TraderModule, StrategyModule, TelegramModule],
  controllers: [BotController],
  providers: [LiveRunner]
})
export class BotModule {}
