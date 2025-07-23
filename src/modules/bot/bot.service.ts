import { Inject, Injectable } from '@nestjs/common';
import { BinanceService } from '../binance/binance.service';
import { WalletService } from '../wallet/wallet.service';
import { TradeLoggerService } from '../logger/trade-logger.service';
import { IStrategy, PositionInfo, StrategyContext } from '../strategy/core/strategy.interface';

@Injectable()
export class BotService {
  private activeStrategies: Record<string, IStrategy> = {};
  private currentPosition: PositionInfo = {
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

  async run(symbol: string, timeframe: string, strategyName: string, debug = false): Promise<void> {
    const strategy = this.activeStrategies[strategyName.toLowerCase()];
    if (!strategy) {
      throw new Error(`Strategy ${strategyName} not found`);
    }

    const candles = await this.binanceService.fetchOHLCV(symbol, timeframe);
    if (!candles || candles.length < 30) {
      throw new Error('Not enough candle data');
    }

    const lastCandle = candles[candles.length - 1];
    const [timestamp, open, high, low, close, volume] = lastCandle;

    if (this.currentPosition.type !== 'none') {
      this.currentPosition.pnl = this.calculatePnl(this.currentPosition, close);
    }

    const context: StrategyContext = {
      price: close,
      symbol,
      balanceUSD: this.walletService.getBalanceUSD(),
      balanceAsset: this.walletService.getBalanceAsset(),
      position: { ...this.currentPosition },
      lastTrade: undefined,
      currentCandle: {
        timestamp,
        open,
        high,
        low,
        close,
        volume
      },
      candles,
      timeframe,
      debug
    };

    const signal = strategy.evaluate(context);

    switch (signal) {
      case 'buy':
        if (this.walletService.getBalanceUSD() > 0 && this.currentPosition.type === 'none') {
          const amount = this.walletService.simulateBuy(close);
          this.currentPosition = this.openPosition('long', close, amount, timestamp, candles.length - 1);
          this.tradeLogger.logTrade({
            timestamp: new Date(timestamp).toISOString(),
            symbol,
            action: 'buy',
            price: close,
            amount,
            balanceUSD: this.walletService.getBalanceUSD(),
            balanceAsset: this.walletService.getBalanceAsset(),
            position: this.currentPosition
          });
        }
        break;

      case 'sell':
      case 'close-long':
        if (this.walletService.getBalanceAsset() > 0 && this.currentPosition.type === 'long') {
          const revenue = this.walletService.simulateSell(close);
          this.tradeLogger.logTrade({
            timestamp: new Date(timestamp).toISOString(),
            symbol,
            action: 'sell',
            price: close,
            amount: this.currentPosition.size,
            balanceUSD: this.walletService.getBalanceUSD(),
            balanceAsset: this.walletService.getBalanceAsset(),
            position: this.currentPosition
          });
          this.currentPosition = this.closePosition(this.currentPosition, close, timestamp);
        }
        break;
    }

    if (debug) {
      const info = this.currentPosition.type !== 'none'
        ? `Position: ${this.currentPosition.type} | Entry: ${this.currentPosition.entryPrice} | PnL: ${this.currentPosition.pnl.toFixed(2)}%`
        : 'No position';
      this.tradeLogger.log(`[${symbol}] ${signal.padEnd(8)} | Price: ${close.toFixed(2)} | ${info}`);
    }
  }

  private openPosition(
    type: 'long' | 'short',
    entryPrice: number,
    size: number,
    timestamp: number,
    candleIndex: number
  ): PositionInfo {
    const sl = entryPrice * 0.99;
    const tp = entryPrice * 1.015;
    const rr = this.calculateRR(entryPrice, sl, tp, type);
    return {
      type,
      entryPrice,
      size,
      pnl: 0,
      entryTimestamp: timestamp,
      lastUpdated: timestamp,
      entryCandleIndex: candleIndex,
      sl,
      tp,
      rr
    };
  }

  private closePosition(position: PositionInfo, exitPrice: number, timestamp: number): PositionInfo {
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
    const diff = currentPrice - position.entryPrice;
    return (diff / position.entryPrice) * 100 * (position.type === 'long' ? 1 : -1);
  }

  private calculateRR(entry: number, sl: number, tp: number, type: 'long' | 'short'): number | undefined {
    const risk = type === 'long' ? entry - sl : sl - entry;
    const reward = type === 'long' ? tp - entry : entry - tp;
    return risk > 0 ? reward / risk : undefined;
  }
}
