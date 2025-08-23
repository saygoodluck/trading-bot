import { IOrderExecutor } from './order-executor.interface';
import { Candle, OrderRequest, OrderResult, PortfolioState, Position, Side } from '../../common/types';
import axios, { AxiosResponse } from 'axios';
import { ConfigService } from '@nestjs/config';
import { Injectable, Logger } from '@nestjs/common';
import { createHmac } from 'crypto';
import { PositionType } from '../../enumerations/positionType';
import { PositionState } from '../../enumerations/position.state';

import { StopSide } from './sim-futures.executor';

@Injectable()
export class BinanceExecutor implements IOrderExecutor {
  protected readonly logger = new Logger(BinanceExecutor.name);

  private readonly apiKey: string;
  private readonly secret: string;
  private readonly baseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('BINANCE_API_KEY')!;
    this.secret = this.config.get<string>('BINANCE_API_SECRET')!;
    this.baseUrl = this.config.get<string>('BINANCE_API_URL')!;
  }

  cancel(id: string, symbol: string): Promise<void> {
    return Promise.resolve(undefined);
  }

  async getPosition(symbol: string): Promise<Position | null> {
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
      const side: Side = amount > 0 ? PositionType.LONG : PositionType.SHORT;

      return {
        side: side,
        state: PositionState.OPEN,
        symbol: pos.symbol,
        entry: {
          price: entryPrice,
          reason: undefined
        },
        close: {
          price: undefined,
          reason: undefined
        },
        qty: Math.abs(amount),
        openedAt: pos.updateTime,
        closedAt: undefined,
        risk: {
          sl: 0,
          tp: 0,
          rr: 0
        },
        pnlUnreal: unrealizedProfit,
        pnlPct: entryPrice > 0 ? (unrealizedProfit / (Math.abs(amount) * entryPrice)) * 100 : 0,
        duration: undefined
      };
    } catch (err) {
      this.logger.error(`[findOpenPosition] Failed to fetch from Binance`, err.response?.data || err.message);
      throw err;
    }
  }

  markToMarket(symbol: string, price: number, ts: number): void {}

  async place(o: OrderRequest): Promise<OrderResult> {
    const params: Record<string, any> = {
      symbol: o.symbol,
      side: o.side,
      type: o.type,
      timestamp: Date.now(),
      quantity: await this.getRoundedOrderSize(o.symbol, o.quantity),
      leverage: 1
    };

    const signature = this.sign(params);

    this.logger.log(`[ Order execution ] on ${this.baseUrl} symbol: ${o.symbol}, side: ${o.side}, amount: ${o.quantity}`);
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
    const filledOrder = await this.waitUntilFilled(o.symbol, res.data.orderId);
    this.logger.log(`[ Successfully filled order ] ${JSON.stringify(filledOrder)}`);
    return filledOrder;
  }

  report(): any {}

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

  private sign(params: Record<string, any>): string {
    const query = new URLSearchParams(params).toString();
    return createHmac('sha256', this.secret).update(query).digest('hex');
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

  private roundToStepSize(quantity: number, stepSize: number): number {
    const precision = Math.floor(Math.log10(1 / stepSize));
    return parseFloat(quantity.toFixed(precision));
  }

  getState(): PortfolioState {
    return undefined;
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

  getConfig() {
    return undefined;
  }
}
