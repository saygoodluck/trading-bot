import { PositionInterface } from './position.interface';
import { TradePosition } from '../database/model/TradePosition';
import { InjectModel } from '@nestjs/sequelize';
import { Inject } from '@nestjs/common';
import { MARKET_PROVIDER } from '../market/market-provider.factory';
import { MarketProvider } from '../market/market-provider.interface';
import { TradePositionDto } from './dto/trade-position.dto';
import { Transaction } from 'sequelize';
import { MarketOrderDto } from '../order/dto/market-order.dto';

export class PositionService implements PositionInterface {
  constructor(
    @Inject(MARKET_PROVIDER) private readonly market: MarketProvider,
    @InjectModel(TradePosition) private readonly positionRepository: typeof TradePosition
  ) {}

  public async fetchMarketOpenPosition(symbol: string): Promise<TradePositionDto | null> {
    const pos: TradePositionDto = await this.market.findOpenPosition(symbol);
    if (!pos) return null;

    const existing = await this.positionRepository.findOne({
      where: {
        symbol,
        state: 'open'
      }
    });

    if (existing) {
      pos.id = existing.id;
    }
    return pos;
  }

  public async save(position: TradePositionDto, transaction?: Transaction): Promise<TradePositionDto> {
    const saved = await this.positionRepository.create({ ...position }, { transaction });
    return new TradePositionDto(saved);
  }

  public async update(pos: TradePositionDto): Promise<TradePositionDto> {
    const existing = await this.positionRepository.findByPk(pos.id);
    if (!existing) {
      throw new Error(`Position with id=${pos.id} not found`);
    }

    await existing.update({ ...pos });

    return new TradePositionDto(existing);
  }

  public async markClosed(pos: TradePositionDto, order: MarketOrderDto, t?: Transaction): Promise<void> {
    const realizedPnL = await this.market.fetchLatestRealizedPnL(pos.symbol);

    const pnlAbs = realizedPnL ?? 0;
    const pnlPct = pos.entryPrice > 0 ? (pnlAbs / (pos.entryPrice * pos.size)) * 100 : 0;
    const duration = Math.floor((Date.now() - pos.openedAt.getTime()) / 1000 / 60);

    await this.positionRepository.update(
      {
        state: 'closed',
        closePrice: order.price,
        closedAt: order.executedAt,
        duration,
        pnlAbs,
        pnlPct
      },
      { where: { id: pos.id }, transaction: t }
    );
  }

  public async findById(id: number): Promise<TradePositionDto> {
    const found = await this.positionRepository.findByPk(id);
    return found ? new TradePositionDto(found) : null;
  }
}
