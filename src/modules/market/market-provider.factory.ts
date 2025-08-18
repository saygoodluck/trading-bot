import { BinanceFuturesService } from './binance/binance-futures.service';
import { ConfigService } from '@nestjs/config';
import { CcxtMarketService } from './cctx-market.service';
import { DemoMarketService } from './demo/demo-market.service';
import { BinanceFuturesTestnetService } from './binance/binance-futures.testnet.service';
import { MarketProvider } from './market-provider.interface';

export const MARKET_PROVIDER = 'MARKET_PROVIDER'; // 👉 Сначала объявляем

export const MarketProviderFactory = {
  provide: MARKET_PROVIDER,
  inject: [ConfigService],
  useFactory: (config: ConfigService): MarketProvider => {
    const provider = config.get<string>('MARKET_PROVIDER');
    console.log('✅ Using MARKET_PROVIDER:', provider);

    switch (provider) {
      case 'binance-futures':
        return new BinanceFuturesService(config);
      case 'binance-testnet-futures':
        return new BinanceFuturesTestnetService(config);
      case 'ccxt':
        return new CcxtMarketService(config);
      case 'demo':
      default:
        return new DemoMarketService();
    }
  }
};
