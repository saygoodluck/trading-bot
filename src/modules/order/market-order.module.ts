import { Module } from '@nestjs/common';
import { MarketOrderService } from './market-order.service';
import { MarketOrder } from '../database/model/MarketOrder';
import { SequelizeModule } from '@nestjs/sequelize';
import { MarketModule } from '../market/market.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [SequelizeModule.forFeature([MarketOrder]), MarketModule, ConfigModule],
  providers: [MarketOrderService],
  exports: [MarketOrderService]
})
export class MarketOrderModule {}
