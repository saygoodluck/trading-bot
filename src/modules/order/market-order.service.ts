import { MarketOrder } from '../database/model/MarketOrder';
import { Inject, Logger } from '@nestjs/common';
import { MarketProvider } from '../market/market-provider.interface';
import { MARKET_PROVIDER } from '../market/market-provider.factory';
import { TradingContext } from '../strategy/trading-context';
import { StrategySignal } from '../strategy/strategy-signal';
import { PositionType } from '../../enumerations/positionType';
import { MarketOrderDto } from './dto/market-order.dto';
import { InjectModel } from '@nestjs/sequelize';
import { Transaction } from 'sequelize';

//todo create sl tp limit orders
export class MarketOrderService {
  private readonly logger = new Logger(MarketOrderService.name);
  private readonly RISK_PERCENT: number = 0.1;

  constructor(
    @Inject(MARKET_PROVIDER) private readonly market: MarketProvider,
    @InjectModel(MarketOrder) private readonly orderRepository: typeof MarketOrder
  ) {}

  public async createOrder(ctx: TradingContext, signal: StrategySignal, transaction?: Transaction): Promise<MarketOrderDto> {
    const { symbol, price, balanceUSD } = ctx;
    const size = ctx.position?.size || (balanceUSD * this.RISK_PERCENT) / price;
    const side = this.mapOrderSide(signal.type, ctx.position?.type);
    try {
      const exec = await this.market.executeMarketOrder(symbol, side, size, 'market');
      const saved = await this.orderRepository.create(
        {
          symbol: exec.symbol,
          type: exec.type.toLowerCase(),
          side: exec.side.toLowerCase(),
          quantity: parseFloat(exec.origQty),
          price: parseFloat(exec.avgPrice),
          status: exec.status.toLowerCase(),
          executedAt: new Date(exec.updateTime || exec.transactTime || Date.now()),
          success: exec.status === 'FILLED'
        },
        { transaction }
      );
      return this.toDto(saved);
    } catch (err) {
      this.logger.error('[ Create order error ]', err.response?.data || err.message);
    }
  }

  public async attachPositionId(orderId: number, positionId: number, transaction?: Transaction): Promise<void> {
    await this.orderRepository.update(
      { positionId },
      {
        where: { id: orderId },
        transaction
      }
    );
  }

  private mapOrderSide(signalType: StrategySignalType, positionType: PositionType): 'buy' | 'sell' {
    if (signalType === StrategySignalType.LONG) return 'buy';
    if (signalType === StrategySignalType.SHORT) return 'sell';
    if (signalType === StrategySignalType.EXIT) {
      return positionType === PositionType.LONG ? 'sell' : 'buy';
    }
    throw new Error(`Unsupported signal type: ${signalType}`);
  }

  private toDto(order: MarketOrder): MarketOrderDto {
    return {
      id: order.id,
      symbol: order.symbol,
      type: order.type,
      side: order.side,
      quantity: order.quantity,
      price: order.price,
      status: order.status,
      executedAt: order.executedAt,
      success: order.success,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt
    };
  }
}
