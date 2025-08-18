import { Module } from '@nestjs/common';
import { DemoMarketService } from './demo-market.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule],
  providers: [DemoMarketService],
  exports: [DemoMarketService]
})
export class DemoMarketModule {}
