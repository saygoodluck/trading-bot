import { TradeWindows } from '../types';
import { AnyTrade } from './analytics';

/** Надёжно парсим таймштамп в миллисекундах. Возвращаем null, если не получилось. */
function parseTsMs(input: number | string | Date): number | null {
  if (input instanceof Date) {
    const ms = input.getTime();
    return Number.isFinite(ms) ? ms : null;
  }

  if (typeof input === 'number') {
    // 10 цифр — похоже на секунды → умножаем
    if (Number.isFinite(input)) {
      if (input < 1e11) return Math.round(input * 1000); // seconds → ms
      return Math.round(input); // already ms
    }
    return null;
  }

  // string
  const s = String(input).trim();
  if (!s) return null;

  // пробуем как число
  const asNum = Number(s);
  if (Number.isFinite(asNum)) {
    if (asNum < 1e11) return Math.round(asNum * 1000); // seconds
    return Math.round(asNum); // ms
  }

  // пробуем как дату (ISO, "YYYY-MM-DD hh:mm:ss" и т.п.)
  const asDate = Date.parse(s.replace(' ', 'T'));
  if (Number.isFinite(asDate)) return asDate;

  return null;
}

function safeISO(ms: number | null): string | null {
  if (ms == null || !Number.isFinite(ms)) return null;
  const d = new Date(ms);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

export function summarizeTradeWindows(trades: AnyTrade[], barTimestamps?: number[]): TradeWindows {
  const valid = (trades ?? []).map((t) => ({ ...t, _ts: toNumberTs((t as any).timestamp ?? (t as any).ts) })).filter((t) => Number.isFinite(t._ts));

  if (valid.length === 0) {
    return {
      tradedFromTs: null,
      tradedToTs: null,
      tradedFrom: null,
      tradedTo: null,
      tradeSpans: []
    };
  }

  const tsSorted = valid.sort((a, b) => a._ts - b._ts);

  const tradedFromTs = tsSorted[0]._ts;
  const tradedToTs = tsSorted[tsSorted.length - 1]._ts;

  const spans: TradeWindows['tradeSpans'] = [];
  let netPos = 0;
  let spanStart: number | null = null;

  for (const t of tsSorted) {
    const ts = t._ts;
    const before = netPos;
    netPos += signedQty(t);

    if (before === 0 && netPos !== 0) spanStart = ts;
    if (before !== 0 && netPos === 0 && spanStart != null) {
      const fromTs = spanStart,
        toTs = ts;
      spans.push({
        fromTs,
        toTs,
        from: new Date(fromTs).toISOString(),
        to: new Date(toTs).toISOString(),
        bars: countBars(fromTs, toTs, barTimestamps)
      });
      spanStart = null;
    }
  }

  return {
    tradedFromTs,
    tradedToTs,
    tradedFrom: new Date(tradedFromTs).toISOString(),
    tradedTo: new Date(tradedToTs).toISOString(),
    tradeSpans: spans
  };
}

function toNumberTs(ts?: number | string): number {
  if (ts == null) return NaN as unknown as number;
  if (typeof ts === 'number') return ts < 1e11 ? ts * 1000 : ts;
  const n = Number(ts);
  return Number.isFinite(n) ? (n < 1e11 ? n * 1000 : n) : NaN;
}

function signedQty(t: AnyTrade): number {
  const qty = typeof t.qty === 'number' ? t.qty : typeof t.amount === 'number' ? t.amount : 0;
  const side = (t.side ?? '').toString().toUpperCase();
  const sign = side === 'BUY' ? 1 : side === 'SELL' ? -1 : 0;
  return qty * sign;
}

function countBars(fromTs: number, toTs: number, bars?: number[]) {
  if (!bars || bars.length === 0) return 0;
  let i = 0,
    n = 0;
  while (i < bars.length && bars[i] < fromTs) i++;
  while (i < bars.length && bars[i] <= toTs) {
    n++;
    i++;
  }
  return n;
}
