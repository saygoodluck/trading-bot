import * as path from 'path';
import * as fs from 'fs';
import { TradePosition } from '../modules/database/model/TradePosition';
import { MarketOrder } from '../modules/database/model/MarketOrder';

const LOG_DIR = path.resolve(process.cwd(), 'logs');
const ORDER_JSON_FILE = path.resolve(LOG_DIR, 'orders.json');
const TRADE_CSV_FILE = path.join(LOG_DIR, 'trades.csv');
const STRATEGY_DEBUG_FILE = path.join(LOG_DIR, 'strategy-debug.txt');
const POSITION_DEBUG_FILE = path.join(LOG_DIR, 'positions.csv');

let headerWritten = false;

/** Общий лог в файл + консоль */
export function log(message: string, context?: string): void {
  const ts = new Date().toISOString();
  const ctx = context ? `[${context}] ` : '';
  const line = `[${ts}] ${ctx}${message}`;
  console.log(line);
  fs.appendFileSync(LOG_DIR, line + '\n', 'utf8');
}

export function debugStrategy(message: string, context?: string): void {
  // const ts = new Date().toISOString();
  const ctx = context ? `[${context}] ` : '';
  const line = `${ctx}${message}`;
  // console.log(line);

  const dir = path.dirname(STRATEGY_DEBUG_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.appendFileSync(STRATEGY_DEBUG_FILE, line + '\n', 'utf8');
}

export function debugPosition(position: TradePosition, context?: string): void {
  const headers = [
    'timestamp',
    'symbol',
    'type',
    'status',
    'entryPrice',
    'closePrice',
    'size',
    'pnlAbs',
    'pnlPct',
    'openedAt',
    'closedAt',
    'duration',
    'sl',
    'tp',
    'rr',
    'entryReason',
    'exitReason',
    'context'
  ];

  const dir = path.dirname(POSITION_DEBUG_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Если файл пустой — пишем заголовок
  if (!fs.existsSync(POSITION_DEBUG_FILE) || fs.statSync(POSITION_DEBUG_FILE).size === 0) {
    fs.appendFileSync(POSITION_DEBUG_FILE, headers.join(',') + '\n', 'utf8');
  }

  const row = [
    new Date().toISOString(),
    position.symbol,
    position.type,
    position.state || '',
    position.entryPrice,
    position.closePrice ?? '',
    position.size,
    position.pnlAbs ?? '',
    position.pnlPct ?? '',
    position.openedAt,
    position.closedAt ?? '',
    position.duration ?? '',
    position.sl ?? '',
    position.tp ?? '',
    position.rr ?? '',
    position.entryReason ?? '',
    position.exitReason ?? '',
    context || ''
  ];

  fs.appendFileSync(POSITION_DEBUG_FILE, row.join(',') + '\n', 'utf8');
}

export function logOrder(order: MarketOrder): void {
  const dir = path.dirname(ORDER_JSON_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  let orders: MarketOrder[] = [];

  if (fs.existsSync(ORDER_JSON_FILE)) {
    try {
      const content = fs.readFileSync(ORDER_JSON_FILE, 'utf8');
      orders = JSON.parse(content);
    } catch (e) {
      console.error('[logOrder] Failed to read or parse existing orders.json', e);
    }
  }

  orders.push(order);

  try {
    fs.writeFileSync(ORDER_JSON_FILE, JSON.stringify(orders, null, 2), 'utf8');
  } catch (e) {
    console.error('[logOrder] Failed to write to orders.json', e);
  }
}

export function logTradeToCsv(position: TradePosition): void {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }

  const isNewFile = !fs.existsSync(TRADE_CSV_FILE);

  if (isNewFile || !headerWritten) {
    const header = ['symbol', 'time_open', 'time_close', 'side', 'entry_price', 'close_price', 'pnl_abs', 'pnl_pct', 'duration_min', 'entry_reason', 'exit_reason'].join(',') + '\n';

    fs.writeFileSync(TRADE_CSV_FILE, header, { flag: 'a' });
    headerWritten = true;
  }

  if (!fs.existsSync(LOG_DIR) || !headerWritten) {
    const header = ['symbol', 'time_open', 'time_close', 'side', 'entry_price', 'close_price', 'pnl_abs', 'pnl_pct', 'duration_min', 'entry_reason', 'exit_reason'].join(',') + '\n';

    fs.writeFileSync(LOG_DIR, header, { flag: 'a' });
    headerWritten = true;
  }

  const row =
    [
      position.symbol,
      new Date(position.openedAt).toISOString(),
      new Date(position.closedAt ?? Date.now()).toISOString(),
      position.type,
      position.entryPrice.toFixed(4),
      (position.closePrice ?? 0).toFixed(4),
      position.pnlAbs.toFixed(2),
      position.pnlPct.toFixed(2),
      (position.duration ?? 0).toFixed(1),
      JSON.stringify(position.entryReason || ''),
      JSON.stringify(position.exitReason || '')
    ].join(',') + '\n';

  fs.appendFile(TRADE_CSV_FILE, row, (err) => {
    if (err) console.error('❌ Failed to write trade to CSV:', err);
  });
}
