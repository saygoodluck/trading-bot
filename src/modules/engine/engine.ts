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

  // sizing
  riskPct?: number; // риск на сделку (доля от equity), по умолчанию 1%
  defaultAtrMult?: number; // множитель ATR для стоп-дистанции
  tpRR?: number;

  // риск/режим
  risk?: {
    dailyLossStopPct?: number;
    dailyProfitStopPct?: number;
    maxTradesPerDay?: number;

    // --- НОВОЕ: жёсткий стоп по ATR ---
    hardStop?: {
      enabled: boolean; // вкл/выкл
      atrPeriod?: number; // дефолт 14
      atrMult?: number; // дефолт 2.5
      neverLoosen?: boolean; // true: стоп можно только подтягивать
      basis?: 'avgEntry'; // зарезервировано для расширений
    };
  };
  regime?: {
    trendFilter?: null | {
      kind: 'EMA' | 'SMA';
      period: number;
      bias?: 'longOnly' | 'shortOnly' | 'both'; // по умолчанию longOnly
    };
  };
};

type EquitySnapshot = {
  ts: number;
  equity: number;
};

type StrategyWithParams = IStrategy & { params?: { emaPeriod?: number } };

export class Engine implements EngineInterface {
  private readonly exec: IOrderExecutor;
  private readonly candles: Candle[] = [];
  private readonly cfg: Config;

  // ---- внутренняя учётка для дневного контроля/пауз
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

    const nowTs = candle.timestamp;
    this.onNewBarDayRoll(nowTs);

    const portfolio = this.exec.getState();
    const dayPnL = this.dayPnLPct(portfolio.equity);

    // пауза
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

    // --- НОВОЕ: сначала проверяем срабатывание защитного стопа на текущем баре
    const pos = await this.exec.getPosition(this.cfg.symbol);
    if (pos && Math.abs(pos.qty) > 0) {
      this.exec.enforceProtectiveStop(this.cfg.symbol, candle);
    }

    // фильтр тренда
    const market = this.buildMarketContext();
    if (!this.passTrendFilter(market)) return;

    // контекст стратегии
    const ctx: Context = {
      symbol: this.cfg.symbol,
      timeframe: this.cfg.timeframe,
      candles: this.candles,
      market,
      portfolio
    };

    // сигнал
    const sig: Signal = this.cfg.strategy.evaluate(ctx);
    const price = candle.close;

    // ордер + риск-сайзинг
    let order: OrderRequest | undefined;

    if (sig.action === 'buy' || sig.action === 'sell') {
      const side = sig.action === 'buy' ? 'BUY' : 'SELL';

      const riskPct = this.cfg.riskPct ?? 0.01;
      const riskUsd = portfolio.equity * riskPct;

      const atrArr = ATR(this.candles, this.cfg.risk?.hardStop?.atrPeriod ?? 14);
      const atrAbs = atrArr[atrArr.length - 1];
      const atrMult = this.cfg.defaultAtrMult ?? 2;

      const stopDistanceAbs = Number.isFinite(atrAbs) ? atrAbs * atrMult : price * 0.001;
      const minStop = price * 0.001; // страховка от слишком узких стопов
      const denom = Math.max(stopDistanceAbs, minStop);

      let qty = Math.floor((riskUsd / denom) * 1000) / 1000;
      if (qty < 0) qty = 0;

      if (qty > 0) {
        order = { symbol: this.cfg.symbol, side, type: 'MARKET', quantity: qty };
      }
    }

    if (sig.action === 'close') {
      const p = pos; // уже брали выше
      const qtyAbs = Math.abs(p?.qty || 0);
      if (qtyAbs > 0) {
        order = {
          symbol: this.cfg.symbol,
          side: p!.qty > 0 ? 'SELL' : 'BUY',
          quantity: qtyAbs,
          type: 'MARKET'
        };
      }
    }

    // --- НОВОЕ: обновляем (или устанавливаем) защитный стоп на основе текущей позиции и ATR
    await this.updateProtectiveStop();

    // лимит сделок
    if (order) {
      this.tradesToday += 1;
      return order;
    }
  }

  /**
   * Формируем рыночный контекст (индикаторы и режим)
   */
  buildMarketContext(): MarketContext {
    const closes = this.candles.map((c) => c.close);
    const last = closes[closes.length - 1];

    const strat = this.cfg.strategy as StrategyWithParams;
    const emaP = Math.max(2, Number(strat?.params?.emaPeriod) || 20); // <-- вот тут починили

    const needed = new Set<number>([50, 200, emaP]);

    const emaMap: Record<number, number> = {};
    for (const p of needed) {
      const arr = EMA(closes, p);
      const v = arr[arr.length - 1];
      if (Number.isFinite(v)) emaMap[p] = v;
    }

    const atr = ATR(this.candles, 14);
    const volAtr = atr[atr.length - 1] / last;

    const ema50 = emaMap[50],
      ema200 = emaMap[200];
    const spread = Number.isFinite(ema50) && Number.isFinite(ema200) ? Math.abs(ema50 - ema200) / last : 0;

    const f = this.cfg.regime?.trendFilter;
    let trendHTF: 'up' | 'down';
    if (f?.kind) {
      const base = f.kind === 'EMA' ? (emaMap[f.period] ?? EMA(closes, f.period).slice(-1)[0]) : SMA(closes, f.period).slice(-1)[0];
      trendHTF = last >= base ? 'up' : 'down';
    } else {
      trendHTF = Number.isFinite(ema50) && Number.isFinite(ema200) && ema50 >= ema200 ? 'up' : 'down';
    }

    const trendLTF = Number.isFinite(ema50) && last >= ema50 ? 'up' : 'down';
    const regime = volAtr > 0.05 ? 'volatile' : spread > 0.01 ? 'trending' : 'ranging';

    return { trendHTF, trendLTF, volATR: volAtr, regime, ema: emaMap };
  }

  // ===================== НОВОЕ: защитный стоп =====================

  private async updateProtectiveStop() {
    const hs = this.cfg.risk?.hardStop;
    if (!hs?.enabled) return;

    const pos = await this.exec.getPosition(this.cfg.symbol);
    if (!pos || Math.abs(pos.qty) === 0) {
      // нет позиции — очищаем стоп на всякий случай
      this.exec.clearProtectiveStop(this.cfg.symbol);
      return;
    }

    const atrArr = ATR(this.candles, hs.atrPeriod ?? 14);
    const atrAbs = atrArr[atrArr.length - 1];
    if (!Number.isFinite(atrAbs)) return;

    const basisPx = pos.entry.price; // avgEntry (у тебя хранится в Position.entry.price)
    const mult = hs.atrMult ?? 2.5;

    if (pos.qty > 0) {
      const stopPx = basisPx - mult * atrAbs;
      this.exec.setProtectiveStop(this.cfg.symbol, 'long', stopPx, hs.neverLoosen ?? true);
    } else {
      const stopPx = basisPx + mult * atrAbs;
      this.exec.setProtectiveStop(this.cfg.symbol, 'short', stopPx, hs.neverLoosen ?? true);
    }
  }

  // ===================== риск/режим утилиты =====================

  private passTrendFilter(market: MarketContext): boolean {
    const f = this.cfg.regime?.trendFilter;
    if (!f) return true;

    const closes = this.candles.map((c) => c.close);
    const last = closes[closes.length - 1];
    const base = f.kind === 'EMA' ? (market.ema?.[f.period] ?? EMA(closes, f.period).slice(-1)[0]) : SMA(closes, f.period).slice(-1)[0];

    if (!Number.isFinite(base)) return false;

    const bias = f.bias ?? 'longOnly';
    if (bias === 'longOnly') return last >= base;
    if (bias === 'shortOnly') return last <= base;
    return true; // both
  }

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
