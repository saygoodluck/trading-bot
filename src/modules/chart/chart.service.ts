import { Injectable } from '@nestjs/common';
import { PythonShell } from 'python-shell';
import * as fs from 'fs';
import * as path from 'path';
import * as csv from 'csv-parser';
import { loadCandles } from '../../utils/candles.util';

@Injectable()
export class ChartService {
  async generateChartFromSymbol(symbol: string, timeframe: string): Promise<void> {
    const candles = await loadCandles(symbol, timeframe);
    const trades = await this.readTrades(symbol);

    if (candles.length === 0) throw new Error(`No candles found for ${symbol} ${timeframe}`);
    if (trades.length === 0) throw new Error(`No trades found for symbol ${symbol}`);

    const data = { candles, trades };

    const scriptPath = path.resolve(process.cwd(), 'src/python-scripts/generate_chart.py');
    const chartPath = path.resolve(process.cwd(), 'logs/chart.png');

    const shell = new PythonShell(scriptPath, {
      args: [JSON.stringify(data)]
    });

    return new Promise((resolve, reject) => {
      shell.end((err) => {
        if (err) return reject(err);
        if (!fs.existsSync(chartPath)) return reject('Chart file not created');
        resolve();
      });
    });
  }

  private readTrades(symbol: string): Promise<any[]> {
    const filePath = path.resolve(process.cwd(), 'logs/trades.csv');
    return new Promise((resolve, reject) => {
      const results = [];
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (row) => {
          if (row.symbol === symbol) {
            results.push({
              timestamp: row.timestamp,
              price: parseFloat(row.price),
              action: row.action
            });
          }
        })
        .on('end', () => resolve(results))
        .on('error', (err) => reject(err));
    });
  }
}
