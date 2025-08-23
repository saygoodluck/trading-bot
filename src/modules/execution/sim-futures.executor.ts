import { IOrderExecutor } from './order-executor.interface';
import { Candle, OrderRequest, OrderResult, PortfolioState, Position } from '../../common/types';

export type StopSide = 'long' | 'short';

interface ProtectiveStop {
  side: StopSide; // направление позиции
  price: number; // уровень стопа
}

type SimFuturesConfig = {
  startCash: number;
  leverage: number;
  takerFee: number;
  makerFee: number;
  maintenanceMarginRate: number;
  liquidationFee: number;
};

const defaultCfg: SimFuturesConfig = {
  startCash: 10_000,
  leverage: 10,
  takerFee: 0.0004,
  makerFee: 0.0002,
  maintenanceMarginRate: 0.005,
  liquidationFee: 0.0005
};

/**
 * USDT-M Futures simulator (ONE-WAY, Cross). qty>0 = long, qty<0 = short.
 */
export class SimFuturesExecutor implements IOrderExecutor {
  constructor(cfg?: Partial<SimFuturesConfig>) {
    this.cfg = { ...defaultCfg, ...(cfg ?? {}) };
    this.cash = this.cfg.startCash;
    this.equityStart = this.cfg.startCash;
    this.dd.peak = this.cfg.startCash;
  }

  // ---------- IOrderExecutor ----------

  async place(o: OrderRequest): Promise<OrderResult> {
    const symbol = o.symbol;
    const mark = this.lastPrice[symbol];
    if (!Number.isFinite(mark)) {
      throw new Error(`SimFutures: mark price for ${symbol} is not set before place()`);
    }

    if (this.isTradingPaused(this.clock)) {
      return { id: this.nextId(symbol), symbol, status: 'CANCELED', executedQty: 0 };
    }

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

    const px = this.execPriceForPendingOrder(o, mark);
    if (px == null) {
      const id = this.nextId(symbol);
      this.pending.set(id, { id, req: o, createdAt: this.clock });
      return { id, symbol, status: 'NEW', executedQty: 0 };
    }

    const exec = this.executeNow(o, px, /*isMaker*/ false);
    return { id: exec.id, symbol, status: 'FILLED', executedQty: exec.executedQty, avgPrice: exec.avgPrice };
  }

  async cancel(id: string, _symbol: string): Promise<void> {
    this.pending.delete(id);
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
    if (!p) return Promise.resolve(null);
    const u = this.unrealizedPnL(p);
    return Promise.resolve({ ...p, pnlUnreal: u });
  }

  markToMarket(symbol: string, price: number, ts: number, ohlc?: { high: number; low: number }): void {
    this.lastPrice[symbol] = price;
    this.clock = ts;

    if (this.pausedUntilTs != null && ts >= this.pausedUntilTs) {
      this.pausedUntilTs = null;
    }

    // fill pending
    const pend = [...this.pending.values()];
    for (const po of pend) {
      if (po.req.symbol !== symbol) continue;
      const px = this.execPriceForPendingOrder(po.req, price, ohlc);
      if (px != null) {
        this.pending.delete(po.id);
        this.executeNow(po.req, px, /*isMaker*/ false, po.id);
      }
    }

    // liquidation
    const p = this.positions[symbol];
    if (p && this.isLiquidatable(p)) {
      const side = p.qty > 0 ? 'SELL' : 'BUY';
      this.forceLiquidate(symbol, side, Math.abs(p.qty), price);
      this.clearProtectiveStop(symbol); // при ликвидации стоп теряет смысл
    }

    // equity curve
    const eq = this.getState().equity;
    this.equityCurve.push({ ts, equity: eq });
    this.trackDD();
  }

  // ---------- NEW: защитные стопы per-symbol ----------

  private protectiveStops = new Map<string, ProtectiveStop>();

  public setProtectiveStop(symbol: string, side: StopSide, price: number, neverLoosen = true) {
    if (!Number.isFinite(price)) return;

    const cur = this.protectiveStops.get(symbol);
    if (!cur) {
      this.protectiveStops.set(symbol, { side, price });
      return;
    }
    if (cur.side !== side) {
      this.protectiveStops.set(symbol, { side, price });
      return;
    }
    if (!neverLoosen) {
      this.protectiveStops.set(symbol, { side, price });
      return;
    }
    // neverLoosen=true → только подтягиваем в сторону прибыли
    if (side === 'long') {
      this.protectiveStops.set(symbol, { side, price: Math.max(cur.price, price) });
    } else {
      this.protectiveStops.set(symbol, { side, price: Math.min(cur.price, price) });
    }
  }

  public clearProtectiveStop(symbol: string) {
    this.protectiveStops.delete(symbol);
  }

  /** Проверка и исполнение стопа по текущей свече для символа */
  public enforceProtectiveStop(symbol: string, bar: Candle) {
    const p = this.positions[symbol];
    const stop = this.protectiveStops.get(symbol);
    if (!p || !stop || p.qty === 0) return;

    const side: StopSide = p.qty > 0 ? 'long' : 'short';

    // если вдруг рассинхрон направления — сбросим
    if (side !== stop.side) {
      this.clearProtectiveStop(symbol);
      return;
    }

    if (side === 'long' && bar.low <= stop.price) {
      this.marketCloseAllAt(symbol, Math.max(stop.price, bar.low));
      this.clearProtectiveStop(symbol);
    } else if (side === 'short' && bar.high >= stop.price) {
      this.marketCloseAllAt(symbol, Math.min(stop.price, bar.high));
      this.clearProtectiveStop(symbol);
    }
  }

  /** Немедленно закрыть всю позицию символа по заданной цене (как рыночной) */
  private marketCloseAllAt(symbol: string, price: number) {
    const pos = this.positions[symbol];
    if (!pos || pos.qty === 0) return;

    const side: 'BUY' | 'SELL' = pos.qty > 0 ? 'SELL' : 'BUY';
    const qtyAbs = Math.abs(pos.qty);

    // комиссия как за тейкер
    const fee = qtyAbs * price * this.cfg.takerFee;

    // реализованный PnL
    const realized = (price - pos.entry.price) * pos.qty;
    this.realizedPnL += realized;
    this.cash += realized;
    this.cash -= fee;

    this.marginUsed -= (qtyAbs * price) / this.cfg.leverage;
    delete this.positions[symbol];

    this.trades.push({ ts: this.clock, symbol, side, qty: qtyAbs, price, fee, pnlRealized: realized });
    this.trackDD();
  }

  report() {
    const endEq = this.getState().equity;
    return {
      summary: {
        equityStart: this.equityStart,
        equityEnd: endEq,
        retPct: ((endEq - this.equityStart) / this.equityStart) * 100,
        trades: this.trades.length,
        realizedPnL: this.realizedPnL,
        maxDD: this.maxDrawdown()
      },
      trades: this.trades,
      equityCurve: this.equityCurve
    };
  }

  // ---------- дневные лимиты / пауза ----------

  private pausedUntilTs: number | null = null;

  public isTradingPaused(ts: number): boolean {
    return this.pausedUntilTs != null && ts < this.pausedUntilTs;
  }

  public pauseUntilNextDay(ts: number): void {
    this.pausedUntilTs = this.startOfNextDayUTC(ts);
  }

  public dayPnLPct(_ts: number): number {
    // оставлено как заглушка — дневной PnL считаем в Engine
    return 0;
  }

  private startOfDayUTC(ts: number): number {
    const d = new Date(ts);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }

  private startOfNextDayUTC(ts: number): number {
    return this.startOfDayUTC(ts) + 24 * 60 * 60 * 1000;
  }

  // ---------- Internal ----------

  private cfg: SimFuturesConfig;
  private cash = 0;
  private equityStart = 0;
  private marginUsed = 0;
  private realizedPnL = 0;
  private lastPrice: Record<string, number> = {};
  private positions: Record<string, Position & { qty: number; entry: { price: number } }> = {};
  private trades: Array<{
    ts: number;
    symbol: string;
    side: 'BUY' | 'SELL';
    qty: number;
    price: number;
    fee: number;
    pnlRealized?: number;
  }> = [];
  private equityCurve: Array<{ ts: number; equity: number }> = [];
  private pending = new Map<string, { id: string; req: OrderRequest; createdAt: number }>();
  private seq = 0;
  private clock = 0;
  private dd = { peak: 0, max: 0 };

  private nextId(symbol: string) {
    return `${symbol}-${++this.seq}`;
  }

  private execPriceForPendingOrder(o: OrderRequest, mark: number, ohlc?: { high: number; low: number }): number | null {
    if (o.type === 'MARKET') return mark;

    const hi = ohlc?.high ?? mark;
    const lo = ohlc?.low ?? mark;

    if (o.type === 'LIMIT' && o.price != null) {
      if (o.side === 'BUY' && lo <= o.price) return o.price;
      if (o.side === 'SELL' && hi >= o.price) return o.price;
      return null;
    }

    if (o.type === 'STOP_MARKET' && o.stopPrice != null) {
      if (o.side === 'BUY' && hi >= o.stopPrice) return o.stopPrice;
      if (o.side === 'SELL' && lo <= o.stopPrice) return o.stopPrice;
      return null;
    }

    if (o.type === 'TAKE_PROFIT' && o.stopPrice != null) {
      if (o.side === 'BUY' && hi >= o.stopPrice) return mark;
      if (o.side === 'SELL' && lo <= o.stopPrice) return mark;
      return null;
    }

    return null;
  }

  private executeNow(o: OrderRequest, price: number, isMaker: boolean, existingId?: string) {
    const { symbol } = o;
    const side = o.side;
    const qty = o.quantity;
    if (qty <= 0) return { id: existingId ?? this.nextId(symbol), executedQty: 0, avgPrice: price };

    const feeRate = isMaker ? this.cfg.makerFee : this.cfg.takerFee;
    const fee = Math.abs(qty) * price * feeRate;

    const pos = this.positions[symbol];
    const signedQty = side === 'BUY' ? qty : -qty;

    if (!pos || pos.qty === 0 || Math.sign(pos.qty) === Math.sign(signedQty)) {
      // open/increase same direction
      const newQty = (pos?.qty ?? 0) + signedQty;
      const newEntry = !pos || pos.qty === 0 ? price : (pos.entry.price * Math.abs(pos.qty) + price * Math.abs(signedQty)) / Math.abs(newQty);

      this.positions[symbol] = {
        symbol,
        side: newQty > 0 ? 'long' : 'short',
        qty: newQty,
        entry: { price: newEntry },
        openedAt: this.clock
      };

      const notional = Math.abs(signedQty) * price;
      this.marginUsed += notional / this.cfg.leverage;
      this.cash -= fee;
    } else {
      // reduce / flip
      const closingQtySigned = Math.min(Math.abs(qty), Math.abs(pos.qty)) * Math.sign(pos.qty);
      const realized = (price - pos.entry.price) * closingQtySigned;

      this.realizedPnL += realized;
      this.cash += realized;
      this.cash -= fee;
      this.marginUsed -= (Math.abs(closingQtySigned) * price) / this.cfg.leverage;

      const remaining = pos.qty + signedQty;
      if (remaining === 0) {
        delete this.positions[symbol];
        this.clearProtectiveStop(symbol); // позиция закрыта — чистим стоп
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
        const flippedNotional = Math.abs(remaining) * price;
        this.marginUsed += flippedNotional / this.cfg.leverage;
        // при перевороте старый стоп теряет валидность; Engine выставит новый
        this.clearProtectiveStop(symbol);
      }
    }

    this.trades.push({ ts: this.clock, symbol, side, qty, price, fee });
    this.trackDD();

    const id = existingId ?? this.nextId(symbol);
    return { id, executedQty: qty, avgPrice: price };
  }

  private unrealizedPnL(p: { qty: number; entry: { price: number }; symbol: string }) {
    const mark = this.lastPrice[p.symbol];
    if (!Number.isFinite(mark)) return 0;
    return (mark - p.entry.price) * p.qty;
  }

  private isLiquidatable(p: { qty: number; entry: { price: number }; symbol: string }) {
    const mark = this.lastPrice[p.symbol];
    const notional = Math.abs(p.qty) * mark;
    const mm = notional * this.cfg.maintenanceMarginRate;
    const equity = this.getState().equity;
    return equity <= mm + 1e-8;
  }

  private forceLiquidate(symbol: string, side: 'BUY' | 'SELL', qty: number, price: number) {
    const penalty = Math.abs(qty) * price * this.cfg.liquidationFee;
    this.cash -= penalty;

    const pos = this.positions[symbol];
    if (pos) {
      const realized = (price - pos.entry.price) * pos.qty;
      this.realizedPnL += realized;
      this.cash += realized;
      this.marginUsed -= (Math.abs(pos.qty) * pos.entry.price) / this.cfg.leverage;
      delete this.positions[symbol];
    }
    this.trades.push({ ts: this.clock, symbol, side, qty, price, fee: penalty, pnlRealized: 0 });
    this.trackDD();
  }

  private trackDD() {
    const eq = this.getState().equity;
    if (this.dd.peak < eq) this.dd.peak = eq;
    const dd = (this.dd.peak - eq) / Math.max(this.dd.peak, 1);
    if (dd > this.dd.max) this.dd.max = dd;
  }

  private maxDrawdown() {
    return this.dd.max * 100;
  }

  getConfig() {
    return undefined;
  }
}
