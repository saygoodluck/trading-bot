import { ExactBarExecutor } from '../execution/exact-bar.executor';
import { Engine } from './engine';
import { TradingDefaults } from './config/trading';

/**
 * Универсальный тип "глубокой частичной" модификации
 */
type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object
    ? (T[K] extends Array<any> ? T[K] : DeepPartial<T[K]>)
    : T[K];
};

/**
 * Конфиг-структуры, которые можно переопределять снаружи.
 * Синхронизировано с TradingDefaults и Engine/ExactBarExecutor опциями.
 */
export type ExecutorConfig = typeof TradingDefaults.executor;
export type EngineConfig = typeof TradingDefaults.engine;

export type EngineOverrides = {
  executor?: DeepPartial<ExecutorConfig>;
  engine?: DeepPartial<EngineConfig>;
};

export type CreateEngineOptions = {
  symbol: string;
  timeframe: string;
  strategy: any;              // IStrategy совместим
  overrides?: EngineOverrides;
};

/**
 * Неболтливый глубокий merge (без зависимостей).
 * - Объединяет только plain-объекты.
 * - Массивы не мержит, а заменяет (обычно это и нужно).
 */
function deepMerge<T extends Record<string, any>>(base: T, patch?: DeepPartial<T>): T {
  if (!patch) return { ...base };
  const out: any = Array.isArray(base) ? [...base] : { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    const prev = (out as any)[k];
    if (prev && typeof prev === 'object' && !Array.isArray(prev) && typeof v === 'object' && !Array.isArray(v)) {
      (out as any)[k] = deepMerge(prev, v as any);
    } else {
      (out as any)[k] = v as any;
    }
  }
  return out;
}

/**
 * Фабрика движка: единая точка правды для executor/engine-конфигов.
 * - Берёт дефолты из TradingDefaults
 * - Применяет overrides (если переданы)
 * - Возвращает и executor, и engine
 */
export class EngineFactory {
  static create(opts: CreateEngineOptions) {
    const { symbol, timeframe, strategy, overrides } = opts;

    // 1) Слепим executor и engine-конфиги
    const execCfg: ExecutorConfig = deepMerge(TradingDefaults.executor, overrides?.executor);
    const engCfg: EngineConfig = deepMerge(TradingDefaults.engine, overrides?.engine);

    // 2) Создаём исполнителя
    const exec = new ExactBarExecutor(execCfg);

    // 3) Создаём движок (важно передать symbol/timeframe/strategy внутрь)
    const engine = new Engine(exec, {
      ...engCfg,
      symbol,
      timeframe,
      strategy
    });

    return { exec, engine };
  }

  /**
   * "Отпечаток" конфигурации двигателя для детерминизма/кеша в оптимизаторе.
   * Если это меняется — хэш кандидатов должен меняться.
   */
  static fingerprint() {
    return {
      executor: TradingDefaults.executor,
      engine: TradingDefaults.engine
    };
  }
}