export type AnyTrade = {
  timestamp: number; // ms
  side: 'BUY' | 'SELL' | string;
  qty?: number;      // для симулятора
  amount?: number;   // если придёт ccxt
  price: number;
  fee?: number;      // комиссия в quote
};

export type EquityPoint = { ts: number; equity: number };

export type RoundTrip = {
  fromTs: number;
  toTs: number;
  side: 'LONG' | 'SHORT';
  qtyEntered: number;
  qtyExited: number;
  pnl: number;   // уже заполняется через attachPnLToTripsFromTrades
  bars: number;  // число баров между входом и выходом
};

// ================== ВСПОМОГАТЕЛЬНОЕ ==================

const normTs = (x: any): number => {
  if (typeof x === 'number') return x < 1e11 ? x * 1000 : x;
  if (typeof x === 'string') return Date.parse(x);
  return Number.isFinite(x) ? Number(x) : NaN;
};
const qtyOf = (t: AnyTrade) => (typeof t.qty === 'number' ? t.qty : (t.amount ?? 0)) || 0;

// бинарные поиски по массиву отсортированных таймштампов баров
function lowerBound(a: number[], x: number): number {
  let lo = 0, hi = a.length;
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (a[mid] < x) lo = mid + 1; else hi = mid; }
  return lo;
}
function upperBound(a: number[], x: number): number {
  let lo = 0, hi = a.length;
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (a[mid] <= x) lo = mid + 1; else hi = mid; }
  return lo;
}
function countBarsBetween(fromTs: number, toTs: number, bars: number[]): number {
  if (!bars?.length) return 0;
  const l = lowerBound(bars, fromTs);
  const r = upperBound(bars, toTs);
  return Math.max(0, r - l);
}

// ================== ТРИПЫ (с обработкой FLIP) ==================

/** Собираем раунд-трипы из последовательности частичных входов/выходов (FIFO), учитываем flip. */
export function buildRoundTripsWithBars(trades: AnyTrade[], barTs: number[]): RoundTrip[] {
  // нормализация/сортировка
  const T = trades.map(t => ({
    ts: normTs((t as any).timestamp ?? (t as any).ts),
    side: String((t as any).side ?? '').toUpperCase() as 'BUY' | 'SELL',
    qty: Math.abs(qtyOf(t)),
    price: (t as any).price,
    fee: t.fee ?? 0
  }))
    .filter(x => Number.isFinite(x.ts) && x.qty > 0)
    .sort((a, b) => a.ts - b.ts);

  const trips: RoundTrip[] = [];
  let pos = 0; // signed qty (>0 long, <0 short)
  let curSide: 'LONG' | 'SHORT' | null = null;
  let openTs: number | null = null;
  let enteredQty = 0;

  for (const t of T) {
    const sideSgn = t.side === 'BUY' ? 1 : -1;
    let qtyLeft = t.qty;

    if (pos === 0) {
      // старт новой позиции
      curSide = sideSgn > 0 ? 'LONG' : 'SHORT';
      openTs = t.ts;
      enteredQty = qtyLeft;
      pos = sideSgn * qtyLeft;
      continue;
    }

    if (Math.sign(pos) === sideSgn) {
      // доливка
      pos += sideSgn * qtyLeft;
      enteredQty += qtyLeft;
      continue;
    }

    // противоположная сделка → сокращение/возможный flip
    while (qtyLeft > 0 && pos !== 0 && Math.sign(pos) === -sideSgn) {
      const posAbs = Math.abs(pos);
      const use = Math.min(posAbs, qtyLeft);
      // уменьшаем позицию
      pos += sideSgn * use;         // т.к. sideSgn противоположен знаку pos
      qtyLeft -= use;

      if (pos === 0 && openTs != null && curSide) {
        // закрыли полностью → фиксируем трип
        const closeTs = t.ts;
        const bars = countBarsBetween(openTs, closeTs, barTs);
        trips.push({
          fromTs: openTs,
          toTs: closeTs,
          side: curSide,
          qtyEntered: enteredQty,
          qtyExited: enteredQty,
          pnl: 0,  // заполним позже attachPnL...
          bars
        });
        // сброс состояния позиции
        curSide = null;
        openTs = null;
        enteredQty = 0;
      }
    }

    // если остался объём после полного закрытия → flip в новую позицию
    if (qtyLeft > 0) {
      curSide = sideSgn > 0 ? 'LONG' : 'SHORT';
      openTs = t.ts;
      enteredQty = qtyLeft;
      pos = sideSgn * qtyLeft;
    }
  }

  return trips;
}

// ================== PNL ДЛЯ ТРИПОВ (FIFO, с комиссиями) ==================

/** Добавляет PnL к каждому трипу, «разворачивая» FIFO по трейдам внутри окна трипа. */
export function attachPnLToTripsFromTrades(trips: RoundTrip[], trades: AnyTrade[]): RoundTrip[] {
  const T = trades.map(t => ({
    ts: normTs((t as any).timestamp ?? (t as any).ts),
    side: String((t as any).side ?? '').toUpperCase() as 'BUY' | 'SELL',
    qty: Math.abs(qtyOf(t)),
    price: (t as any).price,
    fee: t.fee ?? 0
  }))
    .filter(x => Number.isFinite(x.ts) && x.qty > 0)
    .sort((a, b) => a.ts - b.ts);

  return trips.map(trip => {
    const seg = T.filter(x => x.ts >= trip.fromTs && x.ts <= trip.toTs);
    let pnl = 0;
    let fees = 0;

    if (trip.side === 'LONG') {
      // BUY = открываем лоты, SELL = закрываем
      const fifo: Array<{ qty: number; price: number }> = [];
      for (const t of seg) {
        fees += t.fee;
        if (t.side === 'BUY') {
          fifo.push({ qty: t.qty, price: t.price });
        } else {
          let left = t.qty;
          while (left > 0 && fifo.length) {
            const lot = fifo[0];
            const use = Math.min(left, lot.qty);
            pnl += (t.price - lot.price) * use;
            lot.qty -= use;
            left -= use;
            if (lot.qty <= 1e-12) fifo.shift();
          }
        }
      }
    } else {
      // SHORT: SELL = открываем, BUY = закрываем
      const fifo: Array<{ qty: number; price: number }> = [];
      for (const t of seg) {
        fees += t.fee;
        if (t.side === 'SELL') {
          fifo.push({ qty: t.qty, price: t.price });
        } else {
          let left = t.qty;
          while (left > 0 && fifo.length) {
            const lot = fifo[0];
            const use = Math.min(left, lot.qty);
            pnl += (lot.price - t.price) * use;
            lot.qty -= use;
            left -= use;
            if (lot.qty <= 1e-12) fifo.shift();
          }
        }
      }
    }

    return { ...trip, pnl: pnl - fees };
  });
}

// ================== МЕТРИКИ ==================

export function tripsMetrics(trips: RoundTrip[]) {
  const n = trips.length;
  if (!n) {
    return { n: 0, winrate: 0, pf: 0, avgWin: 0, avgLoss: 0, expectancy: 0, maxConsecLosses: 0, avgBarsHeld: 0 };
  }

  const sum = (a: number, b: number) => a + b;
  const wins = trips.filter(t => t.pnl > 0);
  const losses = trips.filter(t => t.pnl < 0);

  const grossWin = wins.map(t => t.pnl).reduce(sum, 0);
  const grossLossAbs = Math.abs(losses.map(t => t.pnl).reduce(sum, 0));

  const winrate = wins.length / n;
  const pf = grossLossAbs > 0 ? grossWin / grossLossAbs : (grossWin > 0 ? Infinity : 0);
  const avgWin = wins.length ? grossWin / wins.length : 0;
  const avgLoss = losses.length ? -grossLossAbs / losses.length : 0;
  const expectancy = winrate * avgWin + (1 - winrate) * avgLoss;

  // макс. серия лоссов
  let maxConsecLosses = 0, cur = 0;
  for (const t of trips) {
    if (t.pnl < 0) { cur++; maxConsecLosses = Math.max(maxConsecLosses, cur); }
    else cur = 0;
  }

  const avgBarsHeld = trips.map(t => t.bars).reduce(sum, 0) / n;

  return { n, winrate, pf, avgWin, avgLoss, expectancy, maxConsecLosses, avgBarsHeld };
}

export function equityMetrics(equity: EquityPoint[]) {
  if (!equity?.length) return {};
  // месячные ретёрны
  const byMonth: Record<string, { first: number; last: number; points: number }> = {};
  for (const p of equity) {
    const d = new Date(p.ts);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    if (!byMonth[key]) byMonth[key] = { first: p.equity, last: p.equity, points: 1 };
    else { byMonth[key].last = p.equity; byMonth[key].points++; }
  }
  const months = Object.keys(byMonth).sort();
  const monthly = months.map(m => {
    const { first, last } = byMonth[m];
    const ret = first > 0 ? last / first - 1 : 0;
    return { month: m, ret };
  });

  const retSeries = equityToReturns(equity);
  const avg = mean(retSeries);
  const vol = std(retSeries);
  // 15m → 96 баров/день
  const sharpe = vol > 0 ? (avg / vol) * Math.sqrt(365 * 96) : 0;

  const dd = maxDrawdown(equity.map(p => p.equity));
  return { monthly, sharpe, maxDD: dd };
}

function equityToReturns(eq: EquityPoint[]) {
  const r: number[] = [];
  for (let i = 1; i < eq.length; i++) r.push(eq[i].equity / eq[i - 1].equity - 1);
  return r;
}

const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
function std(a: number[]) { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))); }

function maxDrawdown(vals: number[]) {
  let peak = vals[0], maxDD = 0;
  for (const v of vals) { peak = Math.max(peak, v); maxDD = Math.max(maxDD, (peak - v) / peak); }
  return maxDD * 100;
}

/** Разбиение на in-sample / out-of-sample по дате splitTs */
export function splitByDate(equity: EquityPoint[], splitTs: number): { ins: EquityPoint[]; oos: EquityPoint[] } {
  const ins = equity.filter(p => p.ts <= splitTs);
  const oos = equity.filter(p => p.ts > splitTs);
  return { ins, oos };
}
