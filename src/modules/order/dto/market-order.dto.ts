import { MarketOrder } from '../../database/model/MarketOrder';
import { MarketOrderStatus } from '../../../enumerations/market-order.status';

export class MarketOrderDto {
  public id: number;
  public symbol: string;
  public type: 'market' | 'limit';
  public side: 'buy' | 'sell';
  public price: number;
  public quantity: number;
  public status: MarketOrderStatus;
  public executedAt: Date;
  public success: boolean;
  public createdAt: Date;
  public updatedAt: Date;

  constructor(marketOrder: MarketOrder) {
    this.id = marketOrder.id;
    this.symbol = marketOrder.symbol;
    this.type = marketOrder.type;
    this.side = marketOrder.side;
    this.price = marketOrder.price;
    this.quantity = marketOrder.quantity;
    this.status = marketOrder.status;
    this.executedAt = marketOrder.executedAt;
    this.success = marketOrder.success;
    this.createdAt = marketOrder.createdAt;
    this.updatedAt = marketOrder.updatedAt;
  }
}
