import { Controller, Get, Query } from '@nestjs/common';
import { BacktestService } from './backtest.service';

@Controller('backtest')
export class BacktestController {
  constructor(private readonly backtestService: BacktestService) {}

  @Get()
  async runBacktest(
    @Query('symbol') symbol: string = 'ETH/USDT',
    @Query('timeframe') timeframe: string = '15m',
    @Query('limit') limit: number = 500,
    @Query('strategy') strategyName: string,
    @Query('debug') debug: boolean = false,
    @Query('initialBalance') initialBalance: number = 1000
  ) {
    try {
      await this.backtestService.runBacktest(
        symbol,
        timeframe,
        limit,
        strategyName,
        initialBalance,
        debug
      );

      return {
        status: 'success',
        message: 'Backtest completed successfully'
      };
    } catch (error) {
      return {
        status: 'error',
        message: error.message,
        availableStrategies: this.backtestService.getAvailableStrategies()
      };
    }
  }

  @Get('strategies')
  getStrategies() {
    return this.backtestService.getAvailableStrategies();
  }
}