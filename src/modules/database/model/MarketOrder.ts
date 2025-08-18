import { BelongsTo, Column, CreatedAt, ForeignKey, Model, Table, UpdatedAt } from 'sequelize-typescript';
import { TradePosition } from './TradePosition';
import { MarketOrderStatus } from '../../../enumerations/market-order.status';

@Table({ tableName: 'market_order', freezeTableName: true })
export class MarketOrder extends Model {
  @Column({ allowNull: false, primaryKey: true, autoIncrement: true })
  public id: number;

  @Column({ allowNull: false })
  public symbol: string;

  @Column({ allowNull: false })
  public type: 'market' | 'limit';

  @Column({ allowNull: false })
  public side: 'buy' | 'sell';

  @Column({ allowNull: true })
  public price: number;

  @Column({ allowNull: false })
  public quantity: number;

  @Column({ allowNull: false })
  public status: MarketOrderStatus;

  @Column({ allowNull: true })
  public executedAt: Date;

  @Column({ allowNull: true })
  public success: boolean;

  @Column({ allowNull: true })
  @ForeignKey(() => TradePosition)
  public positionId: number;

  @BelongsTo(() => TradePosition)
  public position: TradePosition;

  @CreatedAt
  @Column({ allowNull: false })
  public createdAt: Date;

  @UpdatedAt
  @Column({ allowNull: true })
  public updatedAt: Date;
}
