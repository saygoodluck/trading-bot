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
  state?: string;
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
  trendHTF: 'up' | 'down' | 'range' | 'strong_down';
  trendLTF: 'up' | 'down' | 'range';
  volATR: number; // as fraction, e.g. 0.02 = 2%
  regime: 'trending' | 'ranging' | 'volatile' | 'calm';
  ema?: Record<number, number>;
};

export type Candle = { timestamp: number; open: number; high: number; low: number; close: number; volume: number };

export type PortfolioState = { equity: number; cash: number; marginUsed?: number };

export interface StrategyParams {
  [k: string]: number | string | boolean;
}

export interface Context {
  candles: Candle[];
  symbol: string;
  timeframe: string;
  market: MarketContext;
  portfolio: PortfolioState;
}

export type TradeWindows = {
  tradedFromTs: number | null;     // первая сделка
  tradedToTs: number | null;       // последняя сделка
  tradedFrom: string | null;       // ISO
  tradedTo: string | null;         // ISO
  tradeSpans: Array<{
    fromTs: number;
    toTs: number;
    from: string;
    to: string;
    bars: number;                  // если передашь массив equityCurve/candles, можно заполнить
  }>;
};

export type BacktestSummary = {
  equityStart: number;
  equityEnd: number;
  retPct: number;
  trades: number;
  realizedPnL: number;
  maxDD: number;

  backtestFromTs?: number;
  backtestToTs?: number;
  backtestFrom?: string;
  backtestTo?: string;

  tradedFromTs?: number | null;
  tradedToTs?: number | null;
  tradedFrom?: string | null;
  tradedTo?: string | null;
};

export type BacktestResponse = {
  summary: BacktestSummary;
  trades: Array<{
    ts: number;
    symbol: string;
    side: 'BUY'|'SELL';
    qty: number;
    price: number;
    fee?: number;
  }>;
  equityCurve: Array<{ ts: number; equity: number }>;
  // Дополнительно: интервалы открытой позиции
  tradeSpans?: Array<{
    fromTs: number; toTs: number;
    from: string; to: string;
    bars: number;
  }>;
};

export type TF = '1m'|'3m'|'5m'|'15m'|'30m'|'1h'|'2h'|'4h'|'6h'|'8h'|'12h'|'1d';
