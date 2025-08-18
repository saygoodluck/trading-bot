import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { TradePosition } from '../database/model/TradePosition';
import { PositionService } from './position.service';
import { MarketModule } from '../market/market.module';

@Module({
  imports: [SequelizeModule.forFeature([TradePosition]), MarketModule],
  providers: [PositionService],
  exports: [PositionService]
})
export class PositionModule {}
