import { Candle, MarketContext, OrderRequest } from '../../common/types';

export interface EngineInterface {
  execute(candle: Candle): Promise<OrderRequest | void>;

  buildMarketContext(): MarketContext;
}
