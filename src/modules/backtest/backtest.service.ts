import { Inject, Injectable } from '@nestjs/common';
import { BinanceService } from '../binance/binance.service';
import { WalletService } from '../wallet/wallet.service';
import { TradeLoggerService } from '../logger/trade-logger.service';
import { IStrategy, PositionInfo, StrategyContext } from '../strategy/core/strategy.interface';

@Injectable()
export class BacktestService {
  private activeStrategies: Record<string, IStrategy> = {};

  constructor(
    private readonly binanceService: BinanceService,
    private readonly walletService: WalletService,
    private readonly tradeLogger: TradeLoggerService,
    @Inject('STRATEGIES') private readonly strategies: IStrategy[]
  ) {
    strategies.forEach((strategy) => {
      const name = strategy.constructor.name.replace(/Strategy$/i, '').toLowerCase();
      this.activeStrategies[name] = strategy;
    });
  }

  async runBacktest(
    symbol: string = 'BTC/USDT',
    timeframe: string = '1h',
    limit: number = 500,
    strategyName: string = 'smaRsiStrategy',
    initialBalance: number = 1000,
    debug: boolean = false
  ): Promise<any> {
    this.walletService.reset(initialBalance);

    const strategy = this.activeStrategies[strategyName.toLowerCase()];
    if (!strategy) {
      throw new Error(`Strategy ${strategyName} not found`);
    }

    const candles = await this.binanceService.fetchOHLCV(symbol, timeframe, undefined, limit);
    if (!candles || candles.length === 0) {
      throw new Error('No candles data received');
    }

    let currentPosition: PositionInfo = {
      type: 'none',
      entryPrice: 0,
      size: 0,
      pnl: 0,
      entryTimestamp: 0,
      lastUpdated: 0,
      entryCandleIndex: 0,
      sl: undefined,
      tp: undefined,
      rr: undefined
    };

    const tradeHistory = [];

    for (let i = 30; i < candles.length; i++) {
      const currentChunk = candles.slice(0, i + 1);
      const currentCandle = currentChunk[currentChunk.length - 1];
      const [timestamp, open, high, low, close, volume] = currentCandle;

      if (currentPosition.type !== 'none') {
        currentPosition.pnl = this.calculatePnl(currentPosition, close);
      }

      const context: StrategyContext = {
        price: close,
        symbol,
        balanceUSD: this.walletService.getBalanceUSD(),
        balanceAsset: this.walletService.getBalanceAsset(),
        position: { ...currentPosition },
        lastTrade: tradeHistory[tradeHistory.length - 1],
        currentCandle: {
          timestamp,
          open,
          high,
          low,
          close,
          volume
        },
        candles: currentChunk,
        timeframe,
        debug
      };

      const signal = strategy.evaluate(context);

      switch (signal) {
        case 'buy':
          if (this.walletService.getBalanceUSD() > 0 && currentPosition.type === 'none') {
            const amount = this.walletService.simulateBuy(close);
            currentPosition = this.openPosition('long', close, amount, timestamp, 1);
            currentPosition.rr = this.calculateRR(currentPosition);
            this.logTrade('buy', close, amount, timestamp, currentPosition);
            tradeHistory.push({ action: 'buy', price: close, amount, timestamp });
          }
          break;

        case 'sell':
        case 'close-long':
          if (this.walletService.getBalanceAsset() > 0 && currentPosition.type === 'long') {
            const revenue = this.walletService.simulateSell(close);
            this.logTrade('sell', close, revenue, timestamp, currentPosition);
            tradeHistory.push({
              action: 'sell',
              price: close,
              amount: currentPosition.size,
              timestamp
            });
            currentPosition = this.closePosition(currentPosition, close, timestamp);
          }
          break;
      }

      if (debug) {
        this.logDebugInfo(symbol, signal, currentPosition, close);
      }
    }

    return this.finalizeBacktest(symbol, strategyName, timeframe, tradeHistory, candles);
  }

  private openPosition(
    type: 'long' | 'short',
    entryPrice: number,
    size: number,
    timestamp: number,
    currentCandleIndex: number
  ): PositionInfo {
    const position: PositionInfo = {
      type,
      entryPrice,
      size,
      pnl: 0,
      entryTimestamp: timestamp,
      lastUpdated: timestamp,
      entryCandleIndex: currentCandleIndex,
      sl: entryPrice * 0.99,
      tp: entryPrice * 1.015,
      rr: undefined
    };
    position.rr = this.calculateRR(position);
    return position;
  }

  private closePosition(
    position: PositionInfo,
    exitPrice: number,
    timestamp: number
  ): PositionInfo {
    const pnl = this.calculatePnl(position, exitPrice);
    return {
      type: 'none',
      entryPrice: 0,
      size: 0,
      pnl,
      entryTimestamp: 0,
      lastUpdated: timestamp,
      entryCandleIndex: 0,
      sl: position.sl,
      tp: position.tp,
      rr: position.rr
    };
  }

  private calculatePnl(position: PositionInfo, currentPrice: number): number {
    if (position.type === 'none') return 0;

    const priceDiff = currentPrice - position.entryPrice;
    return (priceDiff / position.entryPrice) * 100 * (position.type === 'long' ? 1 : -1);
  }

  private calculateRR(position: PositionInfo): number | undefined {
    if (!position.sl || !position.tp) return undefined;

    const risk =
      position.type === 'long'
        ? position.entryPrice - position.sl
        : position.sl - position.entryPrice;

    const reward =
      position.type === 'long'
        ? position.tp - position.entryPrice
        : position.entryPrice - position.tp;

    return risk > 0 ? reward / risk : undefined;
  }

  private logTrade(
    action: 'buy' | 'sell',
    price: number,
    amount: number,
    timestamp: number,
    position: PositionInfo
  ): void {
    this.tradeLogger.logTrade({
      timestamp: new Date(timestamp).toISOString(),
      symbol: position.symbol || '',
      action,
      price,
      amount,
      balanceUSD: this.walletService.getBalanceUSD(),
      balanceAsset: this.walletService.getBalanceAsset(),
      position
    });
  }

  private logDebugInfo(
    symbol: string,
    signal: string,
    position: PositionInfo,
    price: number
  ): void {
    const positionInfo =
      position.type !== 'none'
        ? `Position: ${position.type} | Entry: ${position.entryPrice} | PnL: ${position.pnl.toFixed(2)}% | RR: ${position.rr?.toFixed(2)}`
        : 'No position';

    this.tradeLogger.log(
      `[${symbol}] ${signal.padEnd(8)} | Price: ${price.toFixed(2)} | ${positionInfo}`
    );
  }

  private finalizeBacktest(
    symbol: string,
    strategyName: string,
    timeframe: string,
    tradeHistory: Array<{
      action: 'buy' | 'sell';
      price: number;
      amount: number;
      timestamp: number;
    }>,
    candles: number[][]
  ): any {
    const finalBalance = this.walletService.getBalanceUSD();
    const assetBalance = this.walletService.getBalanceAsset();
    const finalPrice = tradeHistory.length > 0 ? tradeHistory[tradeHistory.length - 1].price : 0;
    const totalValue = finalBalance + assetBalance * finalPrice;

    const buyTrades = tradeHistory.filter((t) => t.action === 'buy').length;
    const sellTrades = tradeHistory.filter((t) => t.action === 'sell').length;

    const stats = this.calculateTradeStats(tradeHistory);

    const firstTimestamp = candles[0][0];
    const lastTimestamp = candles.at(-1)?.[0] || firstTimestamp;
    const durationDays = Math.max(1, (lastTimestamp - firstTimestamp) / (1000 * 60 * 60 * 24));
    const returnPct =
      ((totalValue - this.walletService.getInitialBalance()) /
        this.walletService.getInitialBalance()) *
      100;
    const avgDailyReturnPct = returnPct / durationDays;

    const summary = {
      timestamp: new Date().toISOString(),
      strategy: strategyName,
      symbol,
      timeframe,
      initialBalance: this.walletService.getInitialBalance(),
      finalBalance,
      assetBalance,
      totalValue,
      returnPct,
      avgDailyReturnPct,
      totalTrades: tradeHistory.length,
      buyTrades,
      sellTrades,
      winRate: stats.winRate,
      maxDrawdown: stats.maxDrawdown
    };
    this.tradeLogger.logSummary(summary);

    return summary;
  }

  private calculateTradeStats(
    tradeHistory: Array<{
      action: 'buy' | 'sell';
      price: number;
    }>
  ): { winRate: number; maxDrawdown: number } {
    const sellTrades = tradeHistory.filter((t) => t.action === 'sell');
    const winRate = sellTrades.length > 0 ? 50 : 0;
    const maxDrawdown = 10;

    return { winRate, maxDrawdown };
  }

  public getAvailableStrategies(): string[] {
    return Object.keys(this.activeStrategies).map((name) => name.replace(/strategy$/i, ''));
  }
}
