import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { BacktestService } from './backtest.service';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class BacktestRunnerService implements OnModuleInit {
  private readonly logger = new Logger(BacktestRunnerService.name);

  constructor(private readonly backtestService: BacktestService) {}

  async onModuleInit() {
    const symbols = [
      'ETH/USDT', 'BTC/USDT', 'SOL/USDT', 'BNB/USDT', 'ADA/USDT',
      'AVAX/USDT', 'LINK/USDT', 'MATIC/USDT', 'DOGE/USDT', 'XRP/USDT',
      'TRX/USDT', 'SUI/USDT', 'TON/USDT', 'PEPE/USDT', 'TRUMP/USDT'
    ];

    const timeframes = ['5m', '15m', '30m', '1h'];
    const strategy = 'emaBollingerScalp';
    const initialBalance = 10000;
    const daysBack = 1;

    const candlesPerDayMap: Record<string, number> = {
      '5m': 288,
      '15m': 96,
      '30m': 48,
      '1h': 24
    };

    this.logger.log(`Running backtests for ${symbols.length} symbols x ${timeframes.length} timeframes...`);

    for (const symbol of symbols) {
      for (const timeframe of timeframes) {
        const candlesPerDay = candlesPerDayMap[timeframe] ?? 24;
        const limit = candlesPerDay * daysBack;

        try {
          const result = await this.backtestService.runBacktest(
            symbol,
            timeframe,
            limit,
            strategy,
            initialBalance,
            false
          );

          const folder = path.resolve(__dirname, '../../../logs/backtest');
          const filename = `${symbol.replace('/', '-')}_${timeframe}.json`;
          const filepath = path.join(folder, filename);
          fs.mkdirSync(folder, { recursive: true });
          fs.writeFileSync(filepath, JSON.stringify(result, null, 2));

          this.logger.log(`✅ Backtest complete: ${symbol} ${timeframe}`);
        } catch (err) {
          this.logger.error(`❌ Error in backtest ${symbol} ${timeframe}`, err);
        }
      }
    }

    this.logger.log('✅ All backtests complete.');
  }
}
