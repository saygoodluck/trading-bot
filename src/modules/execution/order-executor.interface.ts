import { OrderRequest, OrderResult, PortfolioState, Position } from '../../common/types';

export interface IOrderExecutor {
  place(o: OrderRequest): Promise<OrderResult>;

  cancel(id: string, symbol: string): Promise<void>;

  getState(): PortfolioState;

  getPosition(symbol: string): Promise<Position | null>;

  markToMarket(symbol: string, price: number, ts: number): void;

  report(): any;
}
