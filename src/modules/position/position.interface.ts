import { TradePositionDto } from './dto/trade-position.dto';

export interface PositionInterface {
  // openPosition(ctx: TradingContext, signal: StrategySignal): Promise<TradePosition>;

  // closePosition(ctx: TradingContext, pos: TradePosition, signal: StrategySignal): Promise<TradePosition>;

  // updatePositionPnl(pos: TradePosition, currentPrice: number): Promise<TradePosition>;

  fetchMarketOpenPosition(symbol: string): Promise<TradePositionDto | null>;

  update(pos: TradePositionDto): Promise<TradePositionDto>;

  save(pos: TradePositionDto): Promise<TradePositionDto>;
}
