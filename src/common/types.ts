export type OrderType = 'MARKET' | 'LIMIT' | 'STOP_MARKET' | 'STOP_LIMIT' | 'TAKE_PROFIT' | 'TRAILING_STOP';

export type OrderRequest = {
  symbol: string;
  side: 'BUY' | 'SELL';
  type: OrderType;
  quantity: number;
  price?: number;
  stopPrice?: number;
  timeInForce?: 'GTC' | 'IOC' | 'FOK';
  reduceOnly?: boolean;
  clientOrderId?: string;
};

export type OrderResult = {
  id: string;
  symbol: string;
  status: 'NEW' | 'FILLED' | 'PARTIALLY_FILLED' | 'CANCELED';
  executedQty: number;
  avgPrice?: number;
};

export type Position = {
  symbol: string;
  state: string;
  side: Side;
  qty: number;
  risk?: Risk;
  entry: {
    price: number;
    reason?: string;
  };
  close?: {
    price: number;
    reason?: string;
  };
  openedAt: number;
  closedAt?: number;
  pnlUnreal?: number;
  pnlPct?: number;
  duration?: number;
};

export type Risk = {
  sl: number;
  tp: number;
  rr: number;
};

export type Side = 'long' | 'short';

export type MarketContext = {
  trendHTF: 'up' | 'down' | 'range';
  trendLTF: 'up' | 'down' | 'range';
  volATR: number; // as fraction, e.g. 0.02 = 2%
  regime: 'trending' | 'ranging' | 'volatile' | 'calm';
};

export type Candle = {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timeframe?: number;
};

export type PortfolioState = { equity: number; cash: number };

export interface StrategyParams { [k: string]: number|string|boolean }
