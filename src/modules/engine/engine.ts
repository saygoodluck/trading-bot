import { EngineInterface } from './engine.interface';
import { IStrategy } from '../strategy/strategy.interface';
import { Candle, Context, MarketContext, OrderRequest } from '../../common/types';
import { Signal } from '../strategy/strategy-signal';
import { ATR, EMA, SMA } from '../../common/utils/indicators';
import { IOrderExecutor } from '../execution/order-executor.interface';

export type Config = {
  symbol: string;
  timeframe: string;
  strategy: IStrategy;

  // базовый риск/сайзинг
  riskPct?: number;          // риск на сделку (доля equity), дефолт 1%
  defaultAtrMult?: number;   // множитель ATR для стоп-дистанции
  tpRR?: number;
  tradeFromTs?: number;

  // риск/режим
  risk?: {
    dailyLossStopPct?: number;     // дневной минус → стоп дня (%)
    dailyProfitStopPct?: number;   // дневной плюс → стоп дня (%)
    maxTradesPerDay?: number;      // лимит сделок в день

    // поведение риска
    dynamicRiskScaling?: boolean;  // если true — подстраиваем riskPct под оставшийся дневной бюджет
    cooldownBarsAfterLoss?: number;

    // --- жёсткий стоп по ATR ---
    hardStop?: {
      enabled: boolean;
      atrPeriod?: number;   // дефолт 14
      atrMult?: number;     // дефолт 2.5
      neverLoosen?: boolean;
      basis?: 'avgEntry';
    };
  };
  regime?: {
    trendFilter?: null | {
      kind: 'EMA' | 'SMA';
      period: number;
      bias?: 'longOnly' | 'shortOnly' | 'both'; // дефолт 'both'
    };
  };
};

type EquitySnapshot = { ts: number; equity: number };
type StrategyWithParams = IStrategy & { params?: { emaPeriod?: number } };

export class Engine implements EngineInterface {
  private readonly exec: IOrderExecutor;
  private readonly candles: Candle[] = [];
  private readonly cfg: Config;

  // дневной контроль/паузы
  private pauseUntilTs: number | null = null;
  private dayKey: string | null = null;
  private dayStartEquity = NaN;
  private tradesToday = 0;

  private lastEquity: EquitySnapshot | null = null;

  constructor(exec: IOrderExecutor, cfg: Config) {
    this.exec = exec;
    this.cfg = cfg;
  }

  /**
   * Главный цикл: на каждый бар
   */
  async execute(candle: Candle): Promise<OrderRequest | void> {
    this.candles.push(candle);
    if (this.candles.length < 50) return;

    if (this.cfg.tradeFromTs && candle.timestamp < this.cfg.tradeFromTs) return;

    const nowTs = candle.timestamp;
    this.onNewBarDayRoll(nowTs);

    const portfolio = this.exec.getState();
    const dayPnL = this.dayPnLPct(portfolio.equity);

    // жёсткая пауза (день остановлен)
    if (this.pauseUntilTs && nowTs < this.pauseUntilTs) return;

    const { dailyLossStopPct, dailyProfitStopPct, maxTradesPerDay } = this.cfg.risk ?? {};
    if (Number.isFinite(dailyLossStopPct) && dayPnL <= -(dailyLossStopPct as number)) {
      this.pauseUntilNextDay(nowTs);
      return;
    }
    if (Number.isFinite(dailyProfitStopPct) && dayPnL >= (dailyProfitStopPct as number)) {
      this.pauseUntilNextDay(nowTs);
      return;
    }
    if (Number.isFinite(maxTradesPerDay) && this.tradesToday >= (maxTradesPerDay as number)) {
      this.pauseUntilNextDay(nowTs);
      return;
    }

    // сначала проверим защитный стоп на текущем баре (если позиция есть)
    const pos = await this.exec.getPosition(this.cfg.symbol);
    if (pos && Math.abs(pos.qty) > 0) {
      this.exec.enforceProtectiveStop(this.cfg.symbol, candle);
    }

    // рыночный контекст (один раз за бар)
    const market = this.buildMarketContext();
    if (!this.passTrendFilter(market)) return;

    // контекст для стратегии
    const ctx: Context = {
      symbol: this.cfg.symbol,
      timeframe: this.cfg.timeframe,
      candles: this.candles,
      market,
      portfolio
    };

    // сигнал стратегии
    const sig: Signal = this.cfg.strategy.evaluate(ctx);
    const price = candle.close;

    // если сигнал "в ту же сторону" — не добираем
    const sameSide =
      (sig.action === 'buy'  && (pos?.qty ?? 0) > 0) ||
      (sig.action === 'sell' && (pos?.qty ?? 0) < 0);

    let order: OrderRequest | undefined;

    if ((sig.action === 'buy' || sig.action === 'sell') && !sameSide) {
      const side = sig.action === 'buy' ? 'BUY' : 'SELL';

      // === ДИНАМИЧЕСКИЙ РИСК В ПРЕДЕЛАХ ДНЯ ===
      const baseRiskPct = this.cfg.riskPct ?? 0.01;
      const dyn = !!this.cfg.risk?.dynamicRiskScaling;
      const dayLossCap = Math.max(0, Number(this.cfg.risk?.dailyLossStopPct ?? 0));
      const maxTrades = Math.max(1, Number(this.cfg.risk?.maxTradesPerDay ?? 1));

      // сколько дневного риска уже потрачено (в абсолютных %)
      const usedLossPct = dayPnL < 0 ? -dayPnL : 0;
      const remainBudgetPct = Math.max(0, dayLossCap - usedLossPct);

      // riskPct на текущую сделку
      const effRiskPct = dyn
        ? Math.min(baseRiskPct, remainBudgetPct / Math.max(1, (maxTrades - this.tradesToday)))
        : baseRiskPct;

      const riskUsd = portfolio.equity * effRiskPct;

      const atrPeriod = this.cfg.risk?.hardStop?.atrPeriod ?? 14;
      const atrArr = ATR(this.candles, Math.max(1, atrPeriod));
      const atrAbs = atrArr[atrArr.length - 1];

      const atrMult = this.cfg.defaultAtrMult ?? 2;
      const minStopFrac = 0.001; // страховка: 0.1% цены

      const stopDistanceAbs = Number.isFinite(atrAbs) ? atrAbs * atrMult : price * minStopFrac;
      const denom = Math.max(stopDistanceAbs, price * minStopFrac);

      let qty = Math.floor((riskUsd / denom) * 1000) / 1000;
      if (qty < 0) qty = 0;

      if (qty > 0) {
        order = { symbol: this.cfg.symbol, side, type: 'MARKET', quantity: qty };
      }
    }

    if (sig.action === 'close') {
      const qtyAbs = Math.abs(pos?.qty || 0);
      if (qtyAbs > 0) {
        order = {
          symbol: this.cfg.symbol,
          side: (pos!.qty > 0 ? 'SELL' : 'BUY'),
          quantity: qtyAbs,
          type: 'MARKET'
        };
      }
    }

    // подтянуть/установить защитный стоп (если позиция есть/появится)
    await this.updateProtectiveStop();

    if (order) {
      this.tradesToday += 1;
      return order;
    }
  }

  /**
   * Рыночный контекст для стратегии и режимных фильтров
   */
  buildMarketContext(): MarketContext {
    const closes = this.candles.map(c => Number(c.close));
    const last = closes[closes.length - 1];
    const safeLast = Number.isFinite(last) && last > 0 ? last : 1;

    const strat = this.cfg.strategy as StrategyWithParams;
    const emaP = Math.max(2, Number(strat?.params?.emaPeriod) || 20);

    // кэш EMA нужных периодов
    const need = new Set<number>([50, 200, emaP, this.cfg?.regime?.trendFilter?.period ?? 0]);
    need.delete(0);

    const emaMap: Record<number, number> = {};
    for (const p of need) {
      const arr = EMA(closes, p);
      const v = arr[arr.length - 1];
      if (Number.isFinite(v)) emaMap[p] = v;
    }

    const atrArr = ATR(this.candles, 14);
    const atrAbs = atrArr[atrArr.length - 1];
    const volAtr = Number.isFinite(atrAbs) ? (atrAbs / safeLast) : 0;

    const ema50 = emaMap[50];
    const ema200 = emaMap[200];
    const spread = (Number.isFinite(ema50) && Number.isFinite(ema200))
      ? Math.abs(ema50 - ema200) / safeLast
      : 0;

    // HTF тренд — по фильтру, либо 50/200
    const f = this.cfg.regime?.trendFilter;
    let trendHTF: 'up' | 'down';
    if (f?.kind) {
      const base = f.kind === 'EMA'
        ? (emaMap[f.period] ?? EMA(closes, f.period).slice(-1)[0])
        : SMA(closes, f.period).slice(-1)[0];
      trendHTF = last >= (base ?? last) ? 'up' : 'down';
    } else {
      trendHTF = (Number.isFinite(ema50) && Number.isFinite(ema200) && ema50 >= ema200) ? 'up' : 'down';
    }

    const trendLTF = (Number.isFinite(ema50) && last >= ema50) ? 'up' : 'down';
    const regime = volAtr > 0.05 ? 'volatile' : (spread > 0.01 ? 'trending' : 'ranging');

    return { trendHTF, trendLTF, volATR: volAtr, regime, ema: emaMap };
  }

  // ===================== защитный стоп =====================

  private async updateProtectiveStop() {
    const hs = this.cfg.risk?.hardStop;
    if (!hs?.enabled) return;

    const pos = await this.exec.getPosition(this.cfg.symbol);
    if (!pos || Math.abs(pos.qty) === 0) {
      this.exec.clearProtectiveStop(this.cfg.symbol);
      return;
    }

    const atrArr = ATR(this.candles, Math.max(1, hs.atrPeriod ?? 14));
    const atrAbs = atrArr[atrArr.length - 1];
    if (!Number.isFinite(atrAbs)) return;

    const basisPx = pos.entry.price; // avgEntry
    const mult = hs.atrMult ?? 2.5;

    if (pos.qty > 0) {
      const stopPx = basisPx - mult * atrAbs;
      this.exec.setProtectiveStop(this.cfg.symbol, 'long', stopPx, hs.neverLoosen ?? true);
    } else {
      const stopPx = basisPx + mult * atrAbs;
      this.exec.setProtectiveStop(this.cfg.symbol, 'short', stopPx, hs.neverLoosen ?? true);
    }
  }

  // ===================== режим/фильтры =====================

  private passTrendFilter(market: MarketContext): boolean {
    const f = this.cfg.regime?.trendFilter;
    if (!f) return true;

    const closes = this.candles.map(c => Number(c.close));
    const last = closes[closes.length - 1];
    const base = f.kind === 'EMA'
      ? (market.ema?.[f.period] ?? EMA(closes, f.period).slice(-1)[0])
      : SMA(closes, f.period).slice(-1)[0];

    if (!Number.isFinite(base)) return false;

    const bias = f.bias ?? 'both'; // <— раньше было 'longOnly', это ломало дефолт
    if (bias === 'longOnly')  return last >= base;
    if (bias === 'shortOnly') return last <= base;
    return true; // both
  }

  // ===================== внутридневной учёт =====================

  private dayPnLPct(currentEquity: number): number {
    if (!Number.isFinite(this.dayStartEquity) || this.dayStartEquity <= 0) return 0;
    return ((currentEquity - this.dayStartEquity) / this.dayStartEquity) * 100;
  }

  private pauseUntilNextDay(ts: number) {
    this.pauseUntilTs = nextUtcMidnight(ts);
  }

  private onNewBarDayRoll(ts: number) {
    const k = dayKeyUTC(ts);
    if (this.dayKey !== k) {
      const equity = this.exec.getState().equity;
      this.dayKey = k;
      this.dayStartEquity = equity;
      this.tradesToday = 0;
      this.pauseUntilTs = null;
    }
    this.lastEquity = { ts, equity: this.exec.getState().equity };
  }
}

// ===================== локальные утилиты =====================

function dayKeyUTC(ts: number): string {
  const d = new Date(ts);
  const y = d.getUTCFullYear();
  const m = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const dd = d.getUTCDate().toString().padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function nextUtcMidnight(ts: number): number {
  const d = new Date(ts);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime() + 24 * 60 * 60 * 1000;
}
