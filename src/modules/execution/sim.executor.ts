import { IOrderExecutor } from './order-executor.interface';
import { Candle, OrderRequest, OrderResult, PortfolioState, Position } from '../../common/types';

import { StopSide } from './sim-futures.executor';

type Trade = {
  ts: number;
  symbol: string;
  side: 'BUY' | 'SELL';
  qty: number;
  price: number;
  fee: number;
  pnlRealized?: number;
};

export class SimExecutor implements IOrderExecutor {
  private cash: number;
  private positions: Record<string, Position> = {};
  private equityCurve: { ts: number; equity: number }[] = [];
  private trades: Trade[] = [];
  private lastPrice: Record<string, number> = {};
  private orderSeq = 0;

  constructor(private cfg: { feesBps: number; initialEquity: number }) {
    this.cash = cfg?.initialEquity || 10000;
  }

  getState(): PortfolioState {
    const posVal = Object.values(this.positions).reduce((acc, p) => {
      const lp = this.lastPrice[p.symbol] ?? p.entry.price;
      return acc + p.qty * lp * (p.side === 'long' ? 1 : -1);
    }, 0);
    return { equity: this.cash + posVal, cash: this.cash };
  }

  getPosition(symbol: string): Promise<Position | null> {
    return Promise.resolve(this.positions[symbol] ?? null);
  }

  private recordTrade(t: Trade) {
    this.trades.push(t);
  }

  async place(o: OrderRequest): Promise<OrderResult> {
    if (o.type !== 'MARKET') throw new Error('SimExecutor MVP supports MARKET only');
    const price = this.lastPrice[o.symbol] ?? 0;
    const fee = price * o.quantity * (this.cfg.feesBps / 10000);
    const id = `sim-${++this.orderSeq}`;

    const pos = this.positions[o.symbol];
    if (!pos) {
      if (o.side === 'BUY') {
        this.cash -= price * o.quantity + fee;
        this.positions[o.symbol] = {
          symbol: o.symbol,
          state: 'open',
          side: 'long',
          qty: o.quantity,
          entry: {
            price: price
          },
          openedAt: Date.now()
        };
      } else {
        // open short
        this.cash -= fee; // assume margin provided implicitly for MVP
        this.positions[o.symbol] = {
          symbol: o.symbol,
          state: 'open',
          side: 'short',
          qty: o.quantity,
          entry: {
            price: price
          },
          openedAt: Date.now()
        };
      }
      this.recordTrade({ ts: Date.now(), symbol: o.symbol, side: o.side, qty: o.quantity, price, fee });
    } else {
      // adjust existing position
      if (pos.side === 'long') {
        if (o.side === 'BUY') {
          const newQty = pos.qty + o.quantity;
          const newEntry = (pos.entry.price * pos.qty + price * o.quantity) / newQty;
          this.cash -= price * o.quantity + fee;
          pos.qty = newQty;
          pos.entry = {
            price: newEntry
          };
          this.recordTrade({ ts: Date.now(), symbol: o.symbol, side: o.side, qty: o.quantity, price, fee });
        } else {
          // SELL
          const qtyToClose = Math.min(pos.qty, o.quantity);
          const pnl = (price - pos.entry.price) * qtyToClose;
          this.cash += price * qtyToClose - fee + pnl;
          pos.qty -= qtyToClose;
          this.recordTrade({
            ts: Date.now(),
            symbol: o.symbol,
            side: o.side,
            qty: qtyToClose,
            price,
            fee,
            pnlRealized: pnl
          });
          if (pos.qty === 0) delete this.positions[o.symbol];
          // if SELL larger than position -> open short with remaining (simplified)
          const remaining = o.quantity - qtyToClose;
          if (remaining > 0) {
            this.cash -= fee;
            this.positions[o.symbol] = {
              symbol: o.symbol,
              side: 'short',
              state: 'open',
              qty: remaining,
              entry: {
                price
              },
              openedAt: Date.now()
            };
            this.recordTrade({ ts: Date.now(), symbol: o.symbol, side: o.side, qty: remaining, price, fee });
          }
        }
      } else {
        // short
        if (o.side === 'SELL') {
          // increase short
          const newQty = pos.qty + o.quantity;
          const newEntry = (pos.entry.price * pos.qty + price * o.quantity) / newQty;
          this.cash -= fee;
          pos.qty = newQty;
          pos.entry = {
            price: newEntry
          };
          this.recordTrade({ ts: Date.now(), symbol: o.symbol, side: o.side, qty: o.quantity, price, fee });
        } else {
          // BUY to cover
          const qtyToClose = Math.min(pos.qty, o.quantity);
          const pnl = (pos.entry.price - price) * qtyToClose;
          this.cash += -fee + pnl; // covering returns PnL; assume margin neutral for MVP
          pos.qty -= qtyToClose;
          this.recordTrade({
            ts: Date.now(),
            symbol: o.symbol,
            side: o.side,
            qty: qtyToClose,
            price,
            fee,
            pnlRealized: pnl
          });
          if (pos.qty === 0) delete this.positions[o.symbol];
          const remaining = o.quantity - qtyToClose;
          if (remaining > 0) {
            // flip to long
            this.cash -= price * remaining + fee;
            this.positions[o.symbol] = {
              symbol: o.symbol,
              side: 'long',
              state: 'open',
              qty: remaining,
              entry: {
                price: price
              },
              openedAt: Date.now()
            };
            this.recordTrade({ ts: Date.now(), symbol: o.symbol, side: o.side, qty: remaining, price, fee });
          }
        }
      }
    }

    return { id, symbol: o.symbol, status: 'FILLED', executedQty: o.quantity, avgPrice: price };
  }

  async cancel(id: string, symbol: string): Promise<void> {
    return;
  }

  markToMarket(symbol: string, price: number, ts: number): void {
    this.lastPrice[symbol] = price;
    const state = this.getState();
    this.equityCurve.push({ ts, equity: state.equity });
  }

  report(): any {
    const realized = this.trades.reduce((a, t) => a + (t.pnlRealized || 0) - t.fee, 0);
    const equityEnd = this.equityCurve.length ? this.equityCurve[this.equityCurve.length - 1].equity : this.cash;
    const equityStart = this.equityCurve.length ? this.equityCurve[0].equity : this.cfg.initialEquity;
    const retPct = ((equityEnd - equityStart) / equityStart) * 100;
    return {
      summary: { equityStart, equityEnd, retPct, trades: this.trades.length, realizedPnL: realized },
      trades: this.trades,
      equityCurve: this.equityCurve
    };
  }

  dayPnLPct(ts: number): number {
    return 0;
  }

  isTradingPaused(ts: number): boolean {
    return false;
  }

  pauseUntilNextDay(ts: number): void {}

  clearProtectiveStop(symbol: string) {}

  enforceProtectiveStop(symbol: string, candle: Candle) {}

  setProtectiveStop(symbol: string, side: StopSide, price: number, neverLoosen: boolean) {}
}
