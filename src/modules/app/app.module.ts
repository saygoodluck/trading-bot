import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { ConfigModule } from '@nestjs/config';
import * as Joi from 'joi';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { LoggingInterceptor } from '../utils/logging.interceptor';
import { BinanceModule } from '../binance/binance.module';
import { TraderModule } from '../trader/trader.module';
import { BotModule } from '../bot/bot.module';
import { ScheduleModule } from '@nestjs/schedule';
import { BacktestModule } from '../backtest/backtest.module';
import { TradeLoggerService } from '../logger/trade-logger.service';
import { TradeLoggerModule } from '../logger/trade-logger.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      validationSchema: Joi.object({
        NODE_ENV: Joi.string().required()
      }),
      envFilePath: `.env.${process.env.NODE_ENV}`
    }),
    ScheduleModule.forRoot(),
    BinanceModule,
    TraderModule,
    BotModule,
    BacktestModule
  ],
  controllers: [AppController],
  providers: [{ provide: APP_INTERCEPTOR, useClass: LoggingInterceptor }]
})
export class AppModule {}
