import { Module } from '@nestjs/common';
import { BotService } from './bot.service';
import { BotController } from './bot.controller';
import { BinanceModule } from '../binance/binance.module';
import { TraderModule } from '../trader/trader.module';
import { StrategyModule } from '../strategy/core/strategy.module';
import { WalletModule } from '../wallet/wallet.module';
import { TelegramModule } from '../telegram/telegram.module';
import { TradeLoggerModule } from '../logger/trade-logger.module';

@Module({
  imports: [
    BinanceModule,
    TraderModule,
    StrategyModule,
    WalletModule,
    TradeLoggerModule,
    TelegramModule,
    StrategyModule
  ],
  controllers: [BotController],
  providers: [BotService]
})
export class BotModule {}
