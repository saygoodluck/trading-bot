/**
 * Типы и интерфейсы для торговых стратегий
 */

// Тип свечи (OHLCV)
export type Candle = [
  number, // timestamp
  number, // open
  number, // high
  number, // low
  number, // close
  number // volume
];

// Состояние позиции
export interface PositionInfo {
  type: 'long' | 'short' | 'none';
  symbol?: string; // Добавим опциональное поле
  entryPrice: number;
  size: number;
  pnl: number;
  entryTimestamp: number; // Переименуем timestamp в entryTimestamp
  lastUpdated: number; // Добавим поле для последнего обновления
  entryCandleIndex: number;
  sl?: number;
  tp?: number;
  rr?: number;
}

// Детали последней сделки
export interface TradeInfo {
  type: 'buy' | 'sell';
  price: number;
  size: number;
  timestamp: number;
  fee?: number;
  symbol?: string;
  sl?: number,
  tp?: number
}

// Параметры индикаторов
export interface IndicatorValues {
  [key: string]: number | number[] | { [key: string]: number };
}

// Контекст для принятия решений стратегией
export interface StrategyContext {
  price: number;
  symbol: string;
  balanceUSD: number;
  balanceAsset: number;
  position: PositionInfo;
  candles: Candle[];
  lastTrade?: TradeInfo;
  currentCandle?: {
    // Добавим опциональное поле
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  };
  indicators?: IndicatorValues;
  timeframe?: string;
  debug?: boolean;
}

// Типы торговых сигналов
export type SignalType =
  | 'buy' // Открыть лонг
  | 'sell' // Продать (для лонга)
  | 'short' // Открыть шорт
  | 'cover' // Закрыть шорт
  | 'close-long' // Явное закрытие лонга
  | 'close-short' // Явное закрытие шорта
  | 'hold'; // Без действий

// Базовый интерфейс стратегии
export interface IStrategy {
  /**
   * Анализирует контекст и возвращает торговый сигнал
   */
  evaluate(context: StrategyContext): SignalType;

  /**
   * Опционально: Инициализация стратегии
   */
  init?(): Promise<void>;

  /**
   * Опционально: Обновление параметров
   */
  updateConfig?(config: object): void;
}

export interface SummaryLogParams {
  timestamp?: string;
  strategy: string;
  symbol: string;
  timeframe: string;
  initialBalance: number;
  finalBalance: number;
  assetBalance: number;
  totalValue: number;
  returnPct: number;
  avgDailyReturnPct: number;
  totalTrades: number;
  buyTrades: number;
  sellTrades: number;
  winRate: number;
  maxDrawdown: number;
  currentPrice?: number;
}
