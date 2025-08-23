import { Candle, OrderRequest, OrderResult, PortfolioState, Position } from '../../common/types';
import { StopSide } from './sim-futures.executor';

export interface IOrderExecutor {
  place(o: OrderRequest): Promise<OrderResult>;

  cancel(id: string, symbol: string): Promise<void>;

  getState(): PortfolioState;

  getPosition(symbol: string): Promise<Position | null>;

  markToMarket(symbol: string, price: number, ts: number, ohlc?: { open: number; high: number; low: number; close: number }): void;

  report(): any;

  dayPnLPct(ts: number): number;

  pauseUntilNextDay(ts: number): void;

  isTradingPaused(ts: number): boolean;

  setProtectiveStop(symbol: string, side: StopSide, price: number, neverLoosen: boolean): void;

  clearProtectiveStop(symbol: string): void;

  enforceProtectiveStop(symbol: string, candle: Candle): void;
}
