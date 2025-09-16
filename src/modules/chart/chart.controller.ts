import { Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import * as path from 'path';
import { ChartService } from './chart.service';

@Controller('/chart')
export class ChartController {
  constructor(private readonly chartService: ChartService) {}

  @Get()
  async getChart(
    @Res() res: Response,
    @Query('symbol') symbol: string = 'BNB/USDT',
    @Query('timeframe') timeframe: string
  ) {
    await this.chartService.generateChartFromSymbol(symbol, timeframe);
    const chartPath = path.resolve(process.cwd(), 'logs/chart.png');
    res.sendFile(chartPath);
  }
}
