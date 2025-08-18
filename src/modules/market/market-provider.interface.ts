import { TradePositionDto } from '../position/dto/trade-position.dto';
import { Candle } from '../../common/types';

export interface MarketProvider {
  getPrice(symbol: string): Promise<number>;

  executeMarketOrder(symbol: string, side: 'buy' | 'sell', amount: number, type: 'market' | 'limit'): Promise<any>;

  getBalance(symbol?: string): Promise<number>;

  findOpenPosition(symbol: string): Promise<TradePositionDto>;

  cancelAllOrders(symbol: string): Promise<void>;

  fetchOHLCV(symbol: string, interval: string, limit: number): Promise<Candle[]>;

  account(): Promise<any>;

  fetchLatestRealizedPnL(symbol: string): Promise<number | null>;
}
