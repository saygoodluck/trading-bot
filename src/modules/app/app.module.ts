import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { ConfigModule } from '@nestjs/config';
import * as Joi from 'joi';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { LoggingInterceptor } from '../../utils/logging.interceptor';
import { EngineModule } from '../engine/engine.module';
import { BotModule } from '../bot/bot.module';
import { ScheduleModule } from '@nestjs/schedule';
import { BacktestModule } from '../backtest/backtest.module';
import { ChartModule } from '../chart/chart.module';
import { DatabaseModule } from '../database/database.module';
import { KlineModule } from '../market/kline.module';
import { ExecutorModule } from '../execution/executor.module';
import { StreamModule } from '../stream/stream.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      validationSchema: Joi.object({
        NODE_ENV: Joi.string().required()
      }),
      envFilePath: `.env.${process.env.NODE_ENV}`
    }),
    ScheduleModule.forRoot(),
    KlineModule,
    EngineModule,
    BotModule,
    BacktestModule,
    ChartModule,
    DatabaseModule,
    ExecutorModule,
    StreamModule
  ],
  controllers: [AppController],
  providers: [{ provide: APP_INTERCEPTOR, useClass: LoggingInterceptor }]
})
export class AppModule {}
