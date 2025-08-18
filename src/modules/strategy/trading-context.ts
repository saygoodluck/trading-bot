import { TradePositionDto } from '../position/dto/trade-position.dto';
import { Candle, MarketContext, PortfolioState } from '../../common/types';

export class TradingContext {
  public candles: Candle[];
  public symbol: string;
  public timeframe: string;
  public price: number;
  public position: TradePositionDto;
  public balanceUSD: number;

  constructor(candles: Candle[], symbol: string, timeframe: string, balanceUSD: number, position: TradePositionDto) {
    this.candles = candles;
    this.symbol = symbol;
    this.timeframe = timeframe;
    this.price = candles[candles.length - 1].close;
    this.balanceUSD = balanceUSD;
    this.position = position;
  }
}

export interface Context {
  candles: Candle[];
  symbol: string;
  timeframe: string;
  market: MarketContext;
  portfolio: PortfolioState
}
