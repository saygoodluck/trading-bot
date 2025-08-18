import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BinanceHttpBaseService } from './binance-base.service';

@Injectable()
export class BinanceFuturesTestnetService extends BinanceHttpBaseService {
  protected readonly apiKey: string;
  protected readonly secret: string;
  protected readonly baseUrl: string;

  constructor(config: ConfigService) {
    super();
    this.apiKey = config.get<string>('BINANCE_TESTNET_FUTURES_API_KEY')!;
    this.secret = config.get<string>('BINANCE_TESTNET_FUTURES_API_SECRET')!;
    this.baseUrl = config.get<string>('BINANCE_TESTNET_FUTURES_API_URL')!;
  }
}
