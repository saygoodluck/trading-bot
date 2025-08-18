import { EngineInterface } from './engine.interface';
import { IStrategy } from '../strategy/strategy.interface';
import { Candle, MarketContext, OrderRequest } from '../../common/types';
import { Signal } from '../strategy/strategy-signal';
import { ATR, EMA } from '../../common/utils/indicators';
import { IOrderExecutor } from '../execution/order-executor.interface';
import { Context } from '../strategy/trading-context';

export type Config = {
  symbol: string;
  timeframe: string;
  strategy: IStrategy;
  riskPct?: number;
  defaultAtrMult?: number;
  tpRR?: number;
  strategyriskPct?: number;
};

export class Engine implements EngineInterface {
  private readonly exec: IOrderExecutor;
  private readonly candles: Candle[];
  private readonly cfg: Config;

  constructor(exec: IOrderExecutor, cfg: Config) {
    this.exec = exec;
    this.cfg = cfg;
  }

  async execute(candle: Candle): Promise<OrderRequest | void> {
    this.candles.push(candle);

    if (this.candles.length < 50) return;

    const market = this.buildMarketContext();
    const portfolio = this.exec.getState();

    const ctx: Context = {
      symbol: this.cfg.symbol,
      timeframe: this.cfg.timeframe,
      candles: this.candles,
      market,
      portfolio
    };
    const sig: Signal = this.cfg.strategy.evaluate(ctx);
    const price = candle.close;

    let order: OrderRequest;
    if (sig.action === 'buy' || sig.action === 'sell') {
      const side = sig.action === 'buy' ? 'BUY' : 'SELL';
      const riskUsd = portfolio.equity * this.cfg.riskPct;
      const stopDistance = price * market.volATR * this.cfg.defaultAtrMult;
      const qty = Math.max(0, Math.floor((riskUsd / max(stopDistance, price * 0.001)) * 1000) / 1000);

      if (qty > 0) {
        order = { symbol: this.cfg.symbol, side, type: 'MARKET', quantity: qty };
      }
    }

    if (sig.action == 'close') {
      const pos = await this.exec.getPosition(this.cfg.symbol);
      const qty = Math.abs(pos?.qty || 0);
      if (qty > 0)
        order = {
          symbol: this.cfg.symbol,
          side: pos!.qty > 0 ? 'SELL' : 'BUY',
          quantity: pos.qty,
          type: 'MARKET'
        };
    }

    if (order) return order;
  }

  buildMarketContext(): MarketContext {
    const closes = this.candles.map((x) => x.close);
    const ema50 = EMA(closes, 50);
    const ema200 = EMA(closes, 200);
    const last = this.candles[this.candles.length - 1];
    const atr = ATR(this.candles, 14);
    const volAtr = atr[atr.length - 1] / last.close;
    const spread = Math.abs(ema50[ema50.length - 1] - ema200[ema200.length - 1]) / last.close;
    const trendHTF = ema200[ema200.length - 1] <= ema50[ema50.length - 1] ? 'up' : 'down';
    const trendLTF = ema50[ema50.length - 1] <= closes[closes.length - 1] ? 'up' : 'down';
    const regime = volAtr > 0.05 ? 'volatile' : spread > 0.01 ? 'trending' : 'ranging';
    return { trendHTF, trendLTF, volATR: volAtr, regime };
  }
}

function max(a: number, b: number) {
  return a > b ? a : b;
}
