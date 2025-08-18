import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MarketOrder } from './model/MarketOrder';
import { TradePosition } from './model/TradePosition';
import DatabaseService from './services/database.service';

@Module({
  imports: [
    SequelizeModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        dialect: 'postgres',
        host: configService.get('DATABASE_URL'),
        port: +configService.get('DATABASE_PORT'),
        username: configService.get('DATABASE_USERNAME'),
        password: configService.get('DATABASE_PASSWORD'),
        database: configService.get('DATABASE_NAME'),
        logging: false,
        models: [MarketOrder, TradePosition]
      }),
      inject: [ConfigService]
    })
  ],
  providers: [DatabaseService]
})
export class DatabaseModule {}
