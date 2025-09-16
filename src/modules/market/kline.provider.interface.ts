import { Candle } from '../../common/types';

export interface IKlineProvider {
  fetchOHLCV(symbol: string, interval: string, limit: number): Promise<Candle[]>;

  fetchOHLCVRange(symbol: string, interval: string, from: number, to: number): Promise<Candle[]>;
}
