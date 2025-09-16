import axios from 'axios';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Candle, TF } from '../../common/types';

export class BinanceKlineProvider {
  public readonly baseUrl = 'https://fapi.binance.com';

  private cacheDir = path.resolve(process.cwd(), 'cache', 'klines');
  private static MAX_LIMIT = 1500;

  /** базовый «прогрев» кеша — 1 год */
  private defaultPrefetchMs = 365 * 24 * 60 * 60 * 1000;

  /** === ВНЕШНИЕ API === */

  /**
   * Вернуть свечи из кеша, автоматически догружая недостающие диапазоны с Binance.
   * - При первом обращении всегда подгружаем **минимум год** назад от `to` (даже если запросили 30 дней).
   * - При последующих запросах расширяем кеш слева/справа при нехватке.
   * - На выходе — только нужный срез [from..to].
   */
  async fetchRangeCached(
    symbol: string,
    interval: TF,
    from: number,
    to: number = Date.now()
  ): Promise<Candle[]> {
    await this.ensureCacheDir();

    const normalizedSymbol = symbol.replace('/', '');
    const file = this.cacheFile(normalizedSymbol, interval);

    let cache = await this.loadCache(file);

    const haveCache = cache.length > 0;
    const cachedMin = haveCache ? cache[0].timestamp : Number.POSITIVE_INFINITY;
    const cachedMax = haveCache ? cache[cache.length - 1].timestamp : Number.NEGATIVE_INFINITY;

    // Если кеш пуст — сразу забираем минимум год исторических данных до to
    if (!haveCache) {
      const prefetchFrom = Math.min(from, to - this.defaultPrefetchMs);
      const yearChunk = await this.paginateFetchRange(normalizedSymbol, interval, prefetchFrom, to);
      cache = this.mergeAndSort(cache, yearChunk);
      await this.saveCache(file, cache);
    } else {
      // При необходимости расширяем кеш слева/справа
      const needLeft  = from < cachedMin - 1;
      const needRight = to   > cachedMax + 1;

      if (needLeft) {
        const left = await this.paginateFetchRange(normalizedSymbol, interval, from, cachedMin - 1);
        cache = this.mergeAndSort(cache, left);
      }
      if (needRight) {
        const right = await this.paginateFetchRange(normalizedSymbol, interval, cachedMax + 1, to);
        cache = this.mergeAndSort(cache, right);
      }

      if (needLeft || needRight) {
        await this.saveCache(file, cache);
      }
    }

    // Возвращаем только требуемое окно
    return cache.filter(c => c.timestamp >= from && c.timestamp <= to);
  }

  /** Старое API (совместимость): одиночный запрос лимитирован максимум 1500 */
  public async fetchOHLCV(symbol: string, interval: TF, limit = 500): Promise<Candle[]> {
    const normalizedSymbol = symbol.replace('/', '');
    const url = `${this.baseUrl}/fapi/v1/klines`;

    const { data } = await axios.get(url, {
      params: {
        symbol: normalizedSymbol,
        interval,
        limit: Math.min(limit, BinanceKlineProvider.MAX_LIMIT)
      }
    });

    return this.mapKlines(data);
  }

  /** === ВНУТРЕННЕЕ === */

  private async paginateFetchRange(
    symbol: string,
    interval: TF,
    from: number,
    to: number
  ): Promise<Candle[]> {
    const url = `${this.baseUrl}/fapi/v1/klines`;
    const out: Candle[] = [];
    let cursor = from;

    while (cursor <= to) {
      const { data } = await axios.get(url, {
        params: {
          symbol,
          interval,
          limit: BinanceKlineProvider.MAX_LIMIT,
          startTime: cursor,
          endTime: to
        }
      });

      if (!Array.isArray(data) || data.length === 0) break;

      const batch = this.mapKlines(data);
      out.push(...batch);

      const lastTs = batch[batch.length - 1].timestamp;
      // чтобы не зациклиться, двигаем курсор на 1мс дальше последней свечи
      const nextCursor = lastTs + 1;
      if (nextCursor <= cursor) break;
      cursor = nextCursor;

      // Если Binance вернул меньше 1500 — это был последний блок
      if (batch.length < BinanceKlineProvider.MAX_LIMIT) break;
    }

    return out;
  }

  private mapKlines(data: any[]): Candle[] {
    // формат binance: [ openTime, open, high, low, close, volume, closeTime, ... ]
    return data.map((e: any[]) => ({
      timestamp: Number(e[0]),
      open: parseFloat(e[1]),
      high: parseFloat(e[2]),
      low: parseFloat(e[3]),
      close: parseFloat(e[4]),
      volume: parseFloat(e[5])
    })).sort((a, b) => a.timestamp - b.timestamp);
  }

  private cacheFile(symbol: string, interval: string) {
    // один файл на символ+интервал, JSON-массив свечей
    return path.join(this.cacheDir, `${symbol}_${interval}.json`);
  }

  private async ensureCacheDir() {
    await fs.mkdir(this.cacheDir, { recursive: true });
  }

  private async loadCache(file: string): Promise<Candle[]> {
    try {
      const raw = await fs.readFile(file, 'utf8');
      const arr = JSON.parse(raw) as Candle[];
      return Array.isArray(arr)
        ? arr.map(c => ({ ...c, timestamp: Number(c.timestamp) }))
          .sort((a, b) => a.timestamp - b.timestamp)
        : [];
    } catch {
      return [];
    }
  }

  private async saveCache(file: string, candles: Candle[]) {
    // храним отсортированно и без дубликатов
    const unique = this.dedupe(candles).sort((a, b) => a.timestamp - b.timestamp);
    await fs.writeFile(file, JSON.stringify(unique), 'utf8');
  }

  private mergeAndSort(a: Candle[], b: Candle[]): Candle[] {
    return this.dedupe([...a, ...b]).sort((x, y) => x.timestamp - y.timestamp);
  }

  private dedupe(candles: Candle[]): Candle[] {
    const m = new Map<number, Candle>();
    for (const c of candles) m.set(c.timestamp, c);
    return [...m.values()];
  }
}
