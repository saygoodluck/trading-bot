import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BinanceFuturesTestnetService } from './binance/binance-futures.testnet.service';
import { CcxtMarketService } from './cctx-market.service';
import { DemoMarketService } from './demo/demo-market.service';
import { MARKET_PROVIDER, MarketProviderFactory } from './market-provider.factory';
import { MarketController } from './market.controller';

@Module({
  imports: [ConfigModule],
  controllers: [MarketController],
  providers: [BinanceFuturesTestnetService, CcxtMarketService, DemoMarketService, MarketProviderFactory],
  exports: [MARKET_PROVIDER]
})
export class MarketModule {}
