import { IKlineProvider } from './kline.provider.interface';
import { Candle } from '../../common/types';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';

export class BinanceKlineProvider implements IKlineProvider {
  private readonly baseUrl: string;

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>('BINANCE_API_URL')!;
  }

  public async fetchOHLCV(symbol: string, interval: string, limit = 500): Promise<Candle[]> {
    const normalizedSymbol = symbol.replace('/', '');
    const url = `${this.baseUrl}/fapi/v1/klines`;

    const { data } = await axios.get(url, {
      params: {
        symbol: normalizedSymbol,
        interval,
        limit
      }
    });

    return data.map((entry: any[]) => ({
      timestamp: entry[0],
      open: parseFloat(entry[1]),
      high: parseFloat(entry[2]),
      low: parseFloat(entry[3]),
      close: parseFloat(entry[4]),
      volume: parseFloat(entry[5])
    }));
  }
}
