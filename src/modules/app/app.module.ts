import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { ConfigModule } from '@nestjs/config';
import * as Joi from 'joi';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { LoggingInterceptor } from '../../utils/logging.interceptor';
import { TraderModule } from '../engine/trader.module';
import { BotModule } from '../bot/bot.module';
import { ScheduleModule } from '@nestjs/schedule';
import { BacktestModule } from '../backtest/backtest.module';
import { ChartModule } from '../chart/chart.module';
import { DatabaseModule } from '../database/database.module';
import { MarketModule } from '../market/market.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      validationSchema: Joi.object({
        NODE_ENV: Joi.string().required()
      }),
      envFilePath: `.env.${process.env.NODE_ENV}`
    }),
    ScheduleModule.forRoot(),
    MarketModule,
    TraderModule,
    BotModule,
    BacktestModule,
    ChartModule,
    DatabaseModule
  ],
  controllers: [AppController],
  providers: [{ provide: APP_INTERCEPTOR, useClass: LoggingInterceptor }]
})
export class AppModule {}
