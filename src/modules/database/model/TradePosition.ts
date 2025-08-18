import { Column, CreatedAt, HasMany, Model, Table, UpdatedAt } from 'sequelize-typescript';
import { PositionState } from '../../../enumerations/position.state';
import { PositionType } from '../../../enumerations/positionType';
import { MarketOrder } from './MarketOrder';

@Table({ tableName: 'trade_position', freezeTableName: true })
export class TradePosition extends Model {
  @Column({ allowNull: false, primaryKey: true, autoIncrement: true })
  public id: number;

  @Column({ allowNull: false })
  public type: PositionType;

  @Column({ allowNull: false })
  public state: PositionState;

  @Column({ allowNull: false })
  public symbol: string;

  @Column({ allowNull: true })
  public entryPrice: number;

  @Column({ allowNull: true })
  public closePrice: number;

  @Column({ allowNull: false })
  public size: number;

  @Column({ allowNull: false })
  public openedAt: Date;

  @Column({ allowNull: true })
  public closedAt?: Date;

  @Column({ allowNull: true })
  public index: number;

  @Column({ allowNull: false })
  public sl: number;

  @Column({ allowNull: false })
  public tp: number;

  @Column({ allowNull: false })
  public rr: number;

  @Column({ allowNull: true })
  public entryReason: string;

  @Column({ allowNull: true })
  public exitReason: string;

  @Column({ allowNull: true })
  public pnlAbs: number;

  @Column({ allowNull: true })
  public pnlPct: number;

  @Column({ allowNull: true })
  public duration: number;

  @HasMany(() => MarketOrder)
  public orders: MarketOrder[];

  @CreatedAt
  @Column({ allowNull: false })
  public createdAt: Date;

  @UpdatedAt
  @Column({ allowNull: true })
  public updatedAt: Date;
}
