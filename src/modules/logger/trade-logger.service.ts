import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { PositionInfo, SummaryLogParams } from '../strategy/core/strategy.interface';

@Injectable()
export class TradeLoggerService {
  private readonly logDir = path.resolve(__dirname, '../../../logs');
  private readonly logPath = path.join(this.logDir, 'backtest.log');
  private readonly tradeCSV = path.join(this.logDir, 'trades.csv');
  private readonly summaryCSV = path.join(this.logDir, 'summary.csv');
  private readonly performanceCSV = path.join(this.logDir, 'performance.csv');

  constructor() {
    this.ensureReady();
    this.initializeFiles();
  }

  private ensureReady() {
    fs.mkdirSync(this.logDir, { recursive: true });
  }

  private initializeFiles() {
    // Initialize trade log with headers if file doesn't exist
    if (!fs.existsSync(this.tradeCSV)) {
      const tradeHeader =
        'timestamp,symbol,action,price,amount,balanceUSD,balanceAsset,positionType,entryPrice,positionSize,pnl\n';
      fs.writeFileSync(this.tradeCSV, tradeHeader);
    }

    // Initialize summary log with headers
    if (!fs.existsSync(this.summaryCSV)) {
      const summaryHeader =
        'timestamp,strategy,symbol,timeframe,initialBalance,finalBalance,assetBalance,totalValue,returnPct,totalTrades,buyTrades,sellTrades,winRate,maxDrawdown\n';
      fs.writeFileSync(this.summaryCSV, summaryHeader);
    }

    // Initialize performance log with headers
    if (!fs.existsSync(this.performanceCSV)) {
      const performanceHeader =
        'timestamp,portfolioValue,balanceUSD,balanceAsset,currentPrice,positionType,positionPnl\n';
      fs.writeFileSync(this.performanceCSV, performanceHeader);
    }
  }

  log(message: string, context?: string) {
    const timestamp = new Date().toISOString();
    const contextPart = context ? `[${context}] ` : '';
    const line = `[${timestamp}] ${contextPart}${message}`;

    console.log(line);
    fs.appendFileSync(this.logPath, line + '\n', 'utf8');
  }

  logTrade(params: {
    timestamp: string;
    symbol: string;
    action: 'buy' | 'sell';
    price: number;
    amount: number;
    balanceUSD: number;
    balanceAsset: number;
    position?: PositionInfo;
  }) {
    const {
      timestamp,
      symbol,
      action,
      price,
      amount,
      balanceUSD,
      balanceAsset,
      position = {
        type: 'none',
        entryPrice: 0,
        size: 0,
        pnl: 0,
        timestamp: 0,
        entryTimestamp: 0
      }
    } = params;

    const line =
      [
        timestamp,
        symbol,
        action,
        price.toFixed(8),
        amount.toFixed(8),
        balanceUSD.toFixed(2),
        balanceAsset.toFixed(8),
        position.type,
        position.entryPrice.toFixed(8),
        position.size.toFixed(8),
        position.pnl.toFixed(2)
      ].join(',') + '\n';

    fs.appendFileSync(this.tradeCSV, line);
  }

  logSummary(params: SummaryLogParams) {
    const timestamp = params.timestamp || new Date().toISOString();

    const line = [
      timestamp,
      params.strategy,
      params.symbol,
      params.timeframe,
      params.initialBalance.toFixed(2),
      params.finalBalance.toFixed(2),
      params.assetBalance.toFixed(8),
      params.totalValue.toFixed(2),
      params.returnPct.toFixed(2),
      params.avgDailyReturnPct.toFixed(2),
      params.totalTrades,
      params.buyTrades,
      params.sellTrades,
      params.winRate.toFixed(2),
      params.maxDrawdown.toFixed(2)
    ].join(',') + '\n';

    fs.appendFileSync(this.summaryCSV, line);

    // Дополнительный вывод в консоль
    this.logSummaryToConsole(params);
  }

  private logSummaryToConsole(params: SummaryLogParams) {
    this.log(`\n📊 BACKTEST SUMMARY (${params.strategy} - ${params.symbol} - ${params.timeframe}):`, 'SUMMARY');
    this.log(`Initial Balance: $${params.initialBalance.toFixed(2)}`, 'SUMMARY');
    this.log(`Final Balance: $${params.finalBalance.toFixed(2)}`, 'SUMMARY');
    this.log(`Asset Balance: ${params.assetBalance.toFixed(8)}`, 'SUMMARY');
    this.log(`Total Value: $${params.totalValue.toFixed(2)} (${params.returnPct > 0 ? '+' : ''}${params.returnPct.toFixed(2)}%)`, 'SUMMARY');
    this.log(`Total Trades: ${params.totalTrades} (Buy: ${params.buyTrades} | Sell: ${params.sellTrades})`, 'SUMMARY');
    this.log(`Win Rate: ${params.winRate.toFixed(2)}%`, 'SUMMARY');
    this.log(`Average daily PNL: ${params.avgDailyReturnPct}%`, 'SUMMARY');
    this.log(`Max Drawdown: ${params.maxDrawdown.toFixed(2)}%`, 'SUMMARY');
  }

  logPerformance(params: {
    timestamp: number;
    portfolioValue: number;
    balanceUSD: number;
    balanceAsset: number;
    currentPrice: number;
    position?: PositionInfo;
  }) {
    const line =
      [
        new Date(params.timestamp).toISOString(),
        params.portfolioValue.toFixed(2),
        params.balanceUSD.toFixed(2),
        params.balanceAsset.toFixed(8),
        params.currentPrice.toFixed(8),
        params.position?.type || 'none',
        params.position?.pnl.toFixed(2) || '0.00'
      ].join(',') + '\n';

    fs.appendFileSync(this.performanceCSV, line);
  }

  logTradeHistory(
    history: Array<{
      strategy: string;
      symbol: string;
      trades: Array<{
        timestamp: number;
        action: 'buy' | 'sell';
        price: number;
        amount: number;
        position?: PositionInfo;
      }>;
    }>
  ) {
    history.forEach(({ strategy, symbol, trades }) => {
      const filename = `history-${strategy}-${symbol.replace('/', '-')}-${Date.now()}.csv`;
      const filePath = path.join(this.logDir, filename);

      const header = 'timestamp,action,price,amount,positionType,entryPrice,positionSize,pnl\n';
      const lines = trades.map((trade) =>
        [
          new Date(trade.timestamp).toISOString(),
          trade.action,
          trade.price.toFixed(8),
          trade.amount.toFixed(8),
          trade.position?.type || 'none',
          trade.position?.entryPrice.toFixed(8) || '0',
          trade.position?.size.toFixed(8) || '0',
          trade.position?.pnl.toFixed(2) || '0'
        ].join(',')
      );

      fs.writeFileSync(filePath, header + lines.join('\n'));
      this.log(`📝 Trade history saved to ${filePath}`, 'HISTORY');
    });
  }

  calculateStatistics(
    trades: Array<{
      price: number;
      amount: number;
      action: 'buy' | 'sell';
      position?: PositionInfo;
    }>
  ) {
    if (trades.length === 0) return { winRate: 0, maxDrawdown: 0 };

    let profitableTrades = 0;
    let maxDrawdown = 0;
    let peakValue = 0;
    let currentValue = 0;

    trades.forEach((trade) => {
      if (trade.action === 'sell' && trade.position?.pnl && trade.position.pnl > 0) {
        profitableTrades++;
      }

      // Drawdown calculation logic would be more complex in reality
      // This is simplified for illustration
      currentValue = trade.price * trade.amount;
      if (currentValue > peakValue) {
        peakValue = currentValue;
      } else {
        const drawdown = ((peakValue - currentValue) / peakValue) * 100;
        if (drawdown > maxDrawdown) {
          maxDrawdown = drawdown;
        }
      }
    });

    const winRate =
      (profitableTrades / (trades.filter((t) => t.action === 'sell').length || 1)) * 100;

    return {
      winRate,
      maxDrawdown
    };
  }
}
