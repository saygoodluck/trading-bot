import { PositionState } from '../../../enumerations/position.state';
import { TradePosition } from '../../database/model/TradePosition';
import { PositionType } from '../../../enumerations/positionType';

export class TradePositionDto {
  public id?: number;
  public symbol: string;
  public type: PositionType;
  public size: number;
  public entryPrice: number;
  public entryReason: string;
  public closePrice: number;
  public exitReason: string;
  public state: PositionState;
  public openedAt: Date;
  public closedAt: Date;
  public pnlAbs: number;
  public pnlPct: number;
  public duration: number;
  public sl: number;
  public tp: number;
  public rr: number;

  constructor(pos: TradePosition) {
    this.id = pos.id;
    this.symbol = pos.symbol;
    this.size = pos.size;
    this.type = pos.size > 0 ? PositionType.LONG : PositionType.SHORT;
    this.entryPrice = pos.entryPrice;
    this.entryReason = pos.entryReason;
    this.closePrice = pos.closePrice;
    this.exitReason = pos.exitReason;
    this.state = pos.state;
    this.openedAt = pos.openedAt;
    this.closedAt = pos.closedAt;
    this.pnlAbs = pos.pnlAbs;
    this.pnlPct = pos.pnlPct;
    this.duration = pos.duration;
    this.sl = pos.sl;
    this.tp = pos.tp;
    this.rr = pos.rr;
  }
}
