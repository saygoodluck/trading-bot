import { Inject, Injectable, Logger } from '@nestjs/common';
import { PositionService } from '../position/position.service';
import { IStrategy } from '../strategy/strategy.interface';
import { TradingContext } from '../strategy/trading-context';
import { StrategySignal, StrategySignalType } from '../strategy/strategy-signal';
import { MarketProvider } from '../market/market-provider.interface';
import { MARKET_PROVIDER } from '../market/market-provider.factory';
import { Candle } from '../market/candle';
import { MarketOrderService } from '../order/market-order.service';
import { MarketOrderDto } from '../order/dto/market-order.dto';
import { TradePositionDto } from '../position/dto/trade-position.dto';
import { Sequelize } from 'sequelize-typescript';
import { TraderOptions } from './trader.options';

@Injectable()
export class TraderEngine {
  private readonly logger = new Logger(TraderEngine.name);

  constructor(
    @Inject(MARKET_PROVIDER) private readonly market: MarketProvider,
    private readonly positionService: PositionService,
    protected readonly orderService: MarketOrderService,
    private readonly sequelize: Sequelize
  ) {}

  async execute(strategy: IStrategy, options: TradeOptions): Promise<TradePositionDto> {
    const { symbol, timeframe, limit } = options;
    const ctx: TradingContext = await this.getTradingContext(symbol, timeframe, limit);

    if (ctx.position) {
      this.logger.log(`[ Current position ] ${ctx.position.symbol}, ${ctx.position.type}, pnl: ${ctx.position.pnlAbs.toFixed(2)}$ ${ctx.position.pnlPct.toFixed(2)}%, size: ${ctx.position.size}`);
      await this.positionService.update(ctx.position);
    }

    const signal: StrategySignal = strategy.evaluate(ctx);
    this.logger.log(`[ Getting new signal: ${signal.type}]`);

    if (!ctx.position && (signal.type === StrategySignalType.LONG || signal.type === StrategySignalType.SHORT) && ctx.balanceUSD > 0) {
      return this.entryPosition(ctx, signal);
    }

    if (ctx.position && signal.type === StrategySignalType.EXIT) {
      return this.exitPosition(ctx, signal);
    }
  }

  private async getTradingContext(symbol: string, timeframe: string, limit: number) {
    const candles: Candle[] = await this.market.fetchOHLCV(symbol, timeframe, limit);
    const balanceUSD = await this.market.getBalance('USDT');
    const position: TradePositionDto = await this.positionService.fetchMarketOpenPosition(symbol);
    return new TradingContext(candles, symbol, timeframe, balanceUSD, position);
  }

  // private async entryPosition(ctx: TradingContext, signal: StrategySignal): Promise<TradePositionDto> {
  //   return await this.sequelize.transaction(async (t) => {
  //     const order: MarketOrderDto = await this.orderService.createOrder(ctx, signal, t);
  //
  //     if (!order.success) {
  //       this.logger.error(`[ Order execution failed. Skipping position... ]`);
  //       throw new Error('Order failed');
  //     }
  //
  //     const position: TradePositionDto = await this.positionService.fetchMarketOpenPosition(ctx.symbol);
  //     if (!position) throw new Error('Market position not found');
  //     const saved = await this.positionService.save(position, t);
  //     await this.orderService.attachPositionId(order.id, saved.id, t);
  //     return saved;
  //   });
  // }
  //
  // private async exitPosition(ctx: TradingContext, signal: StrategySignal): Promise<TradePositionDto> {
  //   return await this.sequelize.transaction(async (t) => {
  //     const order: MarketOrderDto = await this.orderService.createOrder(ctx, signal, t);
  //
  //     if (!order.success) {
  //       this.logger.error(`[ Exit order failed ]`);
  //       throw new Error('Exit order failed');
  //     }
  //
  //     // retry fetch закрытой позиции
  //     let position: TradePositionDto = null;
  //     for (let i = 0; i < 3; i++) {
  //       position = await this.positionService.fetchMarketOpenPosition(ctx.symbol);
  //       if (!position) break; // позиция закрылась — отлично
  //       this.logger.warn(`[ Position still open, retry ${i + 1} ]`);
  //       await new Promise((r) => setTimeout(r, 300));
  //     }
  //
  //     if (!position) {
  //       this.logger.log(`[ Position closed on Binance. Updating state manually. ]`);
  //       await this.positionService.markClosed(ctx.position, order, t);
  //       await this.orderService.attachPositionId(order.id, ctx.position.id, t);
  //       return await this.positionService.findById(ctx.position.id);
  //     }
  //
  //     // Если Binance всё ещё считает позицию открытой
  //     this.logger.warn(`[ Position not closed after exit order ]`);
  //     throw new Error('Position not closed after exit order');
  //   });
  // }
}
