import axios, { AxiosResponse } from 'axios';
import { createHmac } from 'crypto';
import { MarketProvider } from '../market-provider.interface';
import { Logger } from '@nestjs/common';
import { TradePositionDto } from '../../position/dto/trade-position.dto';
import { PositionState } from '../../../enumerations/position.state';
import { PositionType } from '../../../enumerations/positionType';
import { Candle } from '../../../common/types';

export abstract class BinanceHttpBaseService implements MarketProvider {
  protected readonly logger = new Logger(BinanceHttpBaseService.name);

  protected abstract baseUrl: string;
  protected abstract apiKey: string;
  protected abstract secret: string;

  async executeMarketOrder(symbol: string, side: 'buy' | 'sell', rawQty: number, type: 'market' | 'limit'): Promise<any> {
    const params: Record<string, any> = {
      symbol: symbol,
      side: side.toUpperCase(),
      type: type.toUpperCase(),
      timestamp: Date.now(),
      quantity: await this.getRoundedOrderSize(symbol, rawQty),
      leverage: 1
    };

    const signature = this.sign(params);

    this.logger.log(`[ Order execution ] on ${this.baseUrl} symbol: ${symbol}, side: ${side}, amount: ${rawQty}`);
    let res: AxiosResponse<any, any>;
    try {
      res = await axios.post(`${this.baseUrl}/fapi/v1/order`, null, {
        headers: { 'X-MBX-APIKEY': this.apiKey },
        params: {
          ...params,
          signature
        }
      });
    } catch (err) {
      this.logger.error(` [ Binance order execution error ] ${err.response?.data || err.message}`);
      return null;
    }
    const filledOrder = await this.waitUntilFilled(symbol, res.data.orderId);
    this.logger.log(`[ Successfully filled order ] ${JSON.stringify(filledOrder)}`);
    return filledOrder;
  }

  public async findOpenPosition(symbol: string): Promise<TradePositionDto> {
    const timestamp = Date.now();
    const params = { symbol: symbol, timestamp };
    const signature = this.sign(params);

    try {
      const res = await axios.get(`${this.baseUrl}/fapi/v2/positionRisk`, {
        headers: {
          'X-MBX-APIKEY': this.apiKey
        },
        params: {
          ...params,
          signature
        }
      });

      const positions = res.data as any[];
      const pos = positions.find((p) => p.symbol === symbol && parseFloat(p.positionAmt) !== 0);

      if (!pos) return null;

      this.logger.log(`[ Fetching market position ] ${JSON.stringify(pos)}`);
      const amount = parseFloat(pos.positionAmt);
      const entryPrice = parseFloat(pos.entryPrice);
      const unrealizedProfit = parseFloat(pos.unRealizedProfit);
      const positionType: PositionType = amount > 0 ? PositionType.LONG : PositionType.SHORT;

      return {
        type: positionType,
        state: PositionState.OPEN,
        symbol: pos.symbol,
        entryPrice,
        closePrice: undefined,
        size: Math.abs(amount),
        openedAt: new Date(pos.updateTime),
        closedAt: undefined,
        sl: 0,
        tp: 0,
        rr: 0,
        entryReason: '',
        exitReason: '',
        pnlAbs: unrealizedProfit,
        pnlPct: entryPrice > 0 ? (unrealizedProfit / (Math.abs(amount) * entryPrice)) * 100 : 0,
        duration: undefined
      };
    } catch (err) {
      this.logger.error(`[findOpenPosition] Failed to fetch from Binance`, err.response?.data || err.message);
      throw err;
    }
  }

  public async account(): Promise<any> {
    const timestamp = Date.now();
    const params = { timestamp };
    const signature = this.sign(params);

    try {
      const res = await axios.get(`${this.baseUrl}/fapi/v2/account`, {
        headers: {
          'X-MBX-APIKEY': this.apiKey
        },
        params: {
          ...params,
          signature
        }
      });
      return res.data;
    } catch (err) {
      throw err;
    }
  }

  public async getBalance(symbol = 'USDT'): Promise<number> {
    const timestamp = Date.now();
    const params = { timestamp };
    const signature = this.sign(params);

    const res = await axios.get(`${this.baseUrl}/fapi/v2/account`, {
      headers: {
        'X-MBX-APIKEY': this.apiKey
      },
      params: {
        ...params,
        signature
      }
    });

    const assets = res.data.assets;
    const asset = assets.find((a: any) => a.asset === symbol);
    return asset ? parseFloat(asset.availableBalance) : 0;
  }

  public async fetchOHLCV(symbol: string, interval: string, limit = 500): Promise<Candle[]> {
    const normalizedSymbol = symbol.replace('/', '');
    const url = `${this.baseUrl}/fapi/v1/klines`;

    const { data } = await axios.get(url, {
      params: {
        symbol: normalizedSymbol,
        interval,
        limit
      }
    });

    return data.map((entry: any[]) => ({
      timestamp: entry[0],
      open: parseFloat(entry[1]),
      high: parseFloat(entry[2]),
      low: parseFloat(entry[3]),
      close: parseFloat(entry[4]),
      volume: parseFloat(entry[5])
    }));
  }

  public async getPrice(symbol: string): Promise<number> {
    const res = await axios.get(`${this.baseUrl}/api/v3/ticker/price`, {
      params: { symbol }
    });
    return parseFloat(res.data.price);
  }

  public async fetchLatestRealizedPnL(symbol: string): Promise<number | null> {
    const timestamp = Date.now();
    const params = {
      symbol,
      timestamp,
      type: 'REALIZED_PNL',
      limit: 1
    };
    const signature = this.sign(params);

    try {
      const res = await axios.get(`${this.baseUrl}/fapi/v1/income`, {
        headers: {
          'X-MBX-APIKEY': this.apiKey
        },
        params: {
          ...params,
          signature
        }
      });

      const income = res.data;
      if (Array.isArray(income) && income.length > 0) {
        return parseFloat(income[0].income);
      }

      return null;
    } catch (err) {
      this.logger.error(`[ Latest realized PNL error ${err.response?.data || err.message}]`);
      return null;
    }
  }

  public async cancelAllOrders(symbol: string): Promise<void> {
    return Promise.resolve(undefined);
  }

  private async waitUntilFilled(symbol: string, orderId: number): Promise<any> {
    const timestamp = Date.now();
    const params = { symbol, orderId, timestamp };
    const signature = this.sign(params);

    for (let i = 0; i < 10; i++) {
      const { data } = await axios.get(`${this.baseUrl}/fapi/v1/order`, {
        headers: { 'X-MBX-APIKEY': this.apiKey },
        params: { ...params, signature }
      });

      if (data.status === 'FILLED' || parseFloat(data.executedQty) > 0) {
        return data;
      }

      this.logger?.debug?.(`[waitUntilFilled] not filled yet, attempt ${i + 1}`);
      await new Promise((r) => setTimeout(r, 500));
    }

    throw new Error('Order not filled after retries');
  }

  private async getRoundedOrderSize(symbol: string, rawQty: number): Promise<number> {
    const { data: exchangeInfo } = await axios.get('https://fapi.binance.com/fapi/v1/exchangeInfo', {
      params: { symbol }
    });

    const stepSize = this.extractStepSize(exchangeInfo, symbol);
    return this.roundToStepSize(rawQty, stepSize);
  }

  private extractStepSize(exchangeInfo: any, symbol: string): number {
    const symbolInfo = exchangeInfo.symbols.find((s: any) => s.symbol === symbol);
    if (!symbolInfo) {
      throw new Error(`Symbol ${symbol} not found in exchangeInfo`);
    }

    const lotSizeFilter = symbolInfo.filters.find((f: any) => f.filterType === 'LOT_SIZE');
    if (!lotSizeFilter || !lotSizeFilter.stepSize) {
      throw new Error(`LOT_SIZE filter with stepSize not found for ${symbol}`);
    }

    return parseFloat(lotSizeFilter.stepSize);
  }

  private sign(params: Record<string, any>): string {
    const query = new URLSearchParams(params).toString();
    return createHmac('sha256', this.secret).update(query).digest('hex');
  }

  private roundToStepSize(quantity: number, stepSize: number): number {
    const precision = Math.floor(Math.log10(1 / stepSize));
    return parseFloat(quantity.toFixed(precision));
  }
}
