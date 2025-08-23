import { IOrderExecutor } from './order-executor.interface';
import { Candle, OrderRequest, OrderResult, PortfolioState, Position } from '../../common/types';

type ExecMode = 'immediate' | 'market_next_open';

type ExactExecConfig = {
  startCash?: number;
  leverage?: number;
  takerFee?: number;   // 0.0004 = 4 bps
  makerFee?: number;   // 0.0002 = 2 bps
  maintenanceMarginRate?: number;
  execMode?: ExecMode;
};

type ProtectiveStop = { side: 'long' | 'short'; price: number; neverLoosen: boolean };

export class ExactBarExecutor implements IOrderExecutor {
  private cfg: Required<ExactExecConfig>;
  private cash = 0;
  private equityStart = 0;
  private marginUsed = 0;
  private realizedPnL = 0;

  private lastPrice: Record<string, number> = {};
  private clock = 0;

  private positions: Record<string, Position & { qty: number; entry: { price: number } }> = {};
  private protectiveStops = new Map<string, ProtectiveStop>();

  private pendingNextOpen = new Map<string, OrderRequest[]>(); // per-symbol
  private pendingOthers   = new Map<string, OrderRequest[]>(); // per-symbol

  private trades: Array<{
    ts: number; symbol: string; side: 'BUY'|'SELL'; qty: number; price: number; fee: number; note?: string; pnlRealized?: number;
  }> = [];
  private equityCurve: Array<{ ts: number; equity: number }> = [];
  private seq = 0;

  private dd = { peak: 0, max: 0 };
  private pausedUntilTs: number | null = null;

  constructor(cfg?: ExactExecConfig) {
    this.cfg = {
      startCash: 1000,
      leverage: 10,
      takerFee: 0.0004,
      makerFee: 0.0002,
      maintenanceMarginRate: 0.005,
      execMode: 'market_next_open',
      ...(cfg ?? {})
    };
    this.cash = this.cfg.startCash;
    this.equityStart = this.cfg.startCash;
    this.dd.peak = this.cfg.startCash;
  }

  // ========== IOrderExecutor API ==========

  async place(o: OrderRequest): Promise<OrderResult> {
    const symbol = o.symbol;
    const mark = this.lastPrice[symbol];
    if (!Number.isFinite(mark)) {
      throw new Error(`ExactBarExecutor: no mark for ${symbol} before place()`);
    }

    if (this.isTradingPaused(this.clock)) {
      return { id: this.nextId(symbol), symbol, status: 'CANCELED', executedQty: 0 };
    }

    // reduceOnly корректируем количество
    if (o.reduceOnly) {
      const pos = this.positions[symbol];
      const posQty = pos?.qty ?? 0;
      if (posQty === 0 || Math.sign(posQty) === (o.side === 'BUY' ? 1 : -1)) {
        return { id: this.nextId(symbol), symbol, status: 'CANCELED', executedQty: 0 };
      }
      const maxClosable = Math.min(Math.abs(o.quantity), Math.abs(posQty));
      if (maxClosable <= 0) {
        return { id: this.nextId(symbol), symbol, status: 'CANCELED', executedQty: 0 };
      }
      o = { ...o, quantity: maxClosable };
    }

    // MARKET: по режиму — либо сейчас (immediate), либо “на следующий open”
    if (o.type === 'MARKET') {
      if (this.cfg.execMode === 'immediate') {
        const exec = this.executeNow(o, mark, /*isMaker*/ false);
        return { id: exec.id, symbol: o.symbol, status: 'FILLED', executedQty: exec.executedQty, avgPrice: exec.avgPrice };
      } else {
        const arr = this.pendingNextOpen.get(o.symbol) ?? [];
        arr.push(o);
        this.pendingNextOpen.set(o.symbol, arr);
        const id = this.nextId(o.symbol);
        return { id, symbol: o.symbol, status: 'NEW', executedQty: 0 };
      }
    }

    // LIMIT / STOP_MARKET / TAKE_PROFIT — ждут внутрь бара
    const arr = this.pendingOthers.get(o.symbol) ?? [];
    arr.push(o);
    this.pendingOthers.set(o.symbol, arr);
    const id = this.nextId(o.symbol);
    return { id, symbol: o.symbol, status: 'NEW', executedQty: 0 };
  }

  async cancel(id: string, _symbol: string): Promise<void> {
    // no-op: простая реализация — мы держим только массивы и не храним id
    return;
  }

  async getSymbolInfo(_symbol: string) {
    return { stepSize: 0.001, tickSize: 0.01, basePrecision: 8, quotePrecision: 8 };
  }

  getState(): PortfolioState {
    let upnl = 0;
    for (const p of Object.values(this.positions)) upnl += this.unrealizedPnL(p);
    const equity = this.cash + upnl;
    return { equity, cash: this.cash, marginUsed: this.marginUsed, freeMargin: equity - this.marginUsed } as any;
  }

  async getPosition(symbol: string): Promise<Position | null> {
    const p = this.positions[symbol];
    if (!p) return null;
    const u = this.unrealizedPnL(p);
    return { ...p, pnlUnreal: u };
  }

  setProtectiveStop(symbol: string, side: 'long'|'short', price: number, neverLoosen = true) {
    if (!Number.isFinite(price)) return;
    const cur = this.protectiveStops.get(symbol);
    if (!cur || cur.side !== side) {
      this.protectiveStops.set(symbol, { side, price, neverLoosen });
      return;
    }
    if (!neverLoosen) {
      this.protectiveStops.set(symbol, { side, price, neverLoosen });
      return;
    }
    // neverLoosen=true: только в сторону прибыли
    if (side === 'long') this.protectiveStops.set(symbol, { side, price: Math.max(cur.price, price), neverLoosen });
    else this.protectiveStops.set(symbol, { side, price: Math.min(cur.price, price), neverLoosen });
  }

  clearProtectiveStop(symbol: string) {
    this.protectiveStops.delete(symbol);
  }

  /** НЕ вызывай отдельно — Engine будет передавать сюда полный бар (open/high/low/close) */
  markToMarket(symbol: string, closePrice: number, ts: number, ohlc?: { open?: number; high?: number; low?: number; close?: number }): void {
    this.clock = ts;

    const open = ohlc?.open ?? closePrice;
    const high = ohlc?.high ?? closePrice;
    const low  = ohlc?.low  ?? closePrice;
    const close= ohlc?.close ?? closePrice;

    // === 1) next-open MARKET ===
    const nextQ = this.pendingNextOpen.get(symbol) ?? [];
    if (nextQ.length) {
      for (const o of nextQ) this._execMarket(symbol, o.side, o.quantity, open, /*note*/'next_open');
      this.pendingNextOpen.set(symbol, []);
    }

    // === 2) gap stop на open ===
    const p = this.positions[symbol];
    const stop = this.protectiveStops.get(symbol);
    if (p && stop && ((p.qty>0 && stop.side==='long') || (p.qty<0 && stop.side==='short'))) {
      if (p.qty > 0 && low <= stop.price) {
        const fill = Math.min(open, stop.price); // не лучше стопа
        this._closeAll(symbol, fill, 'gap_stop_long');
      } else if (p.qty < 0 && high >= stop.price) {
        const fill = Math.max(open, stop.price);
        this._closeAll(symbol, fill, 'gap_stop_short');
      }
    }

    // === 3) интрабар стоп ===
    const p2 = this.positions[symbol];
    const st2 = this.protectiveStops.get(symbol);
    if (p2 && st2 && ((p2.qty>0 && st2.side==='long') || (p2.qty<0 && st2.side==='short'))) {
      if (p2.qty > 0 && low <= st2.price && st2.price <= high) {
        this._closeAll(symbol, st2.price, 'stop_long');
      } else if (p2.qty < 0 && low <= st2.price && st2.price <= high) {
        this._closeAll(symbol, st2.price, 'stop_short');
      }
    }

    // === 4) LIMIT/STOP/TP ===
    const others = this.pendingOthers.get(symbol) ?? [];
    const still: OrderRequest[] = [];
    for (const o of others) {
      let px: number | null = null;
      if (o.type === 'LIMIT' && o.price != null) {
        if (o.side === 'BUY' && low <= o.price) px = o.price;
        if (o.side === 'SELL' && high >= o.price) px = o.price;
      } else if ((o.type === 'STOP_MARKET' || o.type === 'TAKE_PROFIT') && o.stopPrice != null) {
        if (o.side === 'BUY' && high >= o.stopPrice) px = o.stopPrice;
        if (o.side === 'SELL' && low  <= o.stopPrice) px = o.stopPrice;
      }
      if (px != null) this._execMarket(symbol, o.side, o.quantity, px, o.type);
      else still.push(o);
    }
    this.pendingOthers.set(symbol, still);

    // === 5) close метка и equity ===
    this.lastPrice[symbol] = close;
    this._pushEquity(ts);
  }

  public enforceProtectiveStop(_symbol: string, _bar: Candle) {
    // в этом исполнителе стопы исполняются внутри markToMarket по OHLC — отдельный вызов не нужен
    return;
  }

  isTradingPaused(ts: number): boolean {
    return this.pausedUntilTs != null && ts < this.pausedUntilTs;
  }
  pauseUntilNextDay(ts: number): void {
    const d = new Date(ts);
    d.setUTCHours(0,0,0,0);
    this.pausedUntilTs = d.getTime() + 24*60*60*1000;
  }
  dayPnLPct(_ts: number): number { return 0; } // считаем в Engine

  report() {
    const endEq = this.getState().equity;
    return {
      summary: {
        equityStart: this.equityStart,
        equityEnd: endEq,
        retPct: ((endEq - this.equityStart) / this.equityStart) * 100,
        trades: this.trades.length,
        realizedPnL: this.realizedPnL,
        maxDD: this.dd.max * 100
      },
      trades: this.trades,
      equityCurve: this.equityCurve
    };
  }

  // ========== internals ==========

  private nextId(symbol: string) { return `${symbol}-${++this.seq}`; }

  private fee(notional: number, maker = false) {
    const rate = maker ? this.cfg.makerFee : this.cfg.takerFee;
    return notional * rate;
  }

  private _execMarket(symbol: string, side: 'BUY'|'SELL', qty: number, price: number, note?: string) {
    if (qty <= 0) return;
    const signed = side === 'BUY' ? qty : -qty;
    const fee = this.fee(Math.abs(qty) * price, /*maker*/ false);

    const pos = this.positions[symbol];
    if (!pos || pos.qty === 0 || Math.sign(pos.qty) === Math.sign(signed)) {
      // open / increase
      const newQty = (pos?.qty ?? 0) + signed;
      const newEntry = !pos || pos.qty === 0
        ? price
        : (pos.entry.price * Math.abs(pos.qty) + price * Math.abs(signed)) / Math.abs(newQty);

      this.positions[symbol] = {
        symbol,
        side: newQty > 0 ? 'long' : 'short',
        qty: newQty,
        entry: { price: newEntry },
        openedAt: this.clock
      };
      this.marginUsed += (Math.abs(signed) * price) / this.cfg.leverage;
      this.cash -= fee;
    } else {
      // reduce / flip
      const closingSigned = Math.min(Math.abs(qty), Math.abs(pos.qty)) * Math.sign(pos.qty);
      const realized = (price - pos.entry.price) * closingSigned;
      this.realizedPnL += realized;
      this.cash += realized;
      this.cash -= fee;
      this.marginUsed -= (Math.abs(closingSigned) * price) / this.cfg.leverage;

      const remaining = pos.qty + signed;
      if (remaining === 0) {
        delete this.positions[symbol];
        this.clearProtectiveStop(symbol);
      } else if (Math.sign(remaining) === Math.sign(pos.qty)) {
        this.positions[symbol] = { ...pos, qty: remaining };
      } else {
        // flip
        this.positions[symbol] = {
          symbol,
          side: remaining > 0 ? 'long' : 'short',
          qty: remaining,
          entry: { price },
          openedAt: this.clock
        };
        this.marginUsed += (Math.abs(remaining) * price) / this.cfg.leverage;
        this.clearProtectiveStop(symbol);
      }
    }

    this.trades.push({ ts: this.clock, symbol, side, qty, price, fee, note });
    this._trackDD();
  }

  private _closeAll(symbol: string, price: number, note?: string) {
    const pos = this.positions[symbol];
    if (!pos || pos.qty === 0) return;
    const side: 'BUY'|'SELL' = pos.qty > 0 ? 'SELL' : 'BUY';
    this._execMarket(symbol, side, Math.abs(pos.qty), price, note);
    this.clearProtectiveStop(symbol);
  }

  private _pushEquity(ts: number) {
    const equity = this.getState().equity;
    this.equityCurve.push({ ts, equity });
    this._trackDD();
  }

  private _trackDD() {
    const eq = this.getState().equity;
    if (this.dd.peak < eq) this.dd.peak = eq;
    const dd = (this.dd.peak - eq) / Math.max(this.dd.peak, 1);
    if (dd > this.dd.max) this.dd.max = dd;
  }

  private unrealizedPnL(p: { qty: number; entry: { price: number }; symbol: string }) {
    const mark = this.lastPrice[p.symbol];
    if (!Number.isFinite(mark)) return 0;
    return (mark - p.entry.price) * p.qty;
  }

  private executeNow(
    o: OrderRequest,
    price: number,
    _isMaker = false,
    existingId?: string
  ) {
    const id = existingId ?? this.nextId(o.symbol);
    // немедленно исполняем как рыночный тейкер
    this._execMarket(o.symbol, o.side as 'BUY' | 'SELL', o.quantity, price, 'immediate');
    return { id, executedQty: o.quantity, avgPrice: price };
  }
}
