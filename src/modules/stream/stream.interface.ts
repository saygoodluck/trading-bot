import { KlineHandler } from './binance-stream.service';

export interface IStream {
  connectKlines(sumbol: string, timeframe: string, onCloseBar: KlineHandler): void;
}
