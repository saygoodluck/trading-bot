import * as fs from 'fs';
import * as path from 'path';
import * as csv from 'csv-parser';
import { Candle } from '../common/types';

export async function saveCandles(symbol: string, timeframe: string, candles: Candle[]): Promise<void> {
  const dir = path.resolve(process.cwd(), 'logs/candles');
  fs.mkdirSync(dir, { recursive: true });

  const fileName = `${symbol.replace('/', '-')}-${timeframe}.csv`;
  const filePath = path.join(dir, fileName);

  const header = 'open,high,low,close,volume\n';
  const lines = candles.map((c) => {
    return `${c.open},${c.high},${c.low},${c.close},${c.volume}`;
  });

  const csv = header + lines.join('\n');

  fs.writeFileSync(filePath, csv, 'utf8');
}

export async function loadCandles(symbol: string, timeframe: string): Promise<Candle[]> {
  const fileName = `${symbol.replace('/', '-')}-${timeframe}.csv`;
  const filePath = path.resolve(process.cwd(), 'logs/candles', fileName);

  return new Promise((resolve, reject) => {
    const result: Candle[] = [];
    if (!fs.existsSync(filePath)) return resolve([]);

    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        result.push({
          timestamp: row.timestamp,
          open: parseFloat(row.open),
          high: parseFloat(row.high),
          low: parseFloat(row.low),
          close: parseFloat(row.close),
          volume: parseFloat(row.volume)
        });
      })
      .on('end', () => resolve(result))
      .on('error', (err) => reject(err));
  });
}
