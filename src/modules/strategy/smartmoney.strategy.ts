import { Injectable, Logger } from '@nestjs/common';
import { IStrategy, SignalType, StrategyContext, Candle, PositionInfo } from './core/strategy.interface';
import {
  getSMA,
  getHigherTimeframeCandles,
  findLiquidityZones,
  findOrderBlocks,
  calculateRiskReward,
  getRSI,
  getATR
} from '../utils/indicators.util';

@Injectable()
export class SmartMoneyStrategy implements IStrategy {
  private readonly logger = new Logger(SmartMoneyStrategy.name);
  private swingHighs: number[] = [];
  private swingLows: number[] = [];
  private lastImpulseSignal: { type: 'bullish' | 'bearish' | null; timestamp: number } = {
    type: null,
    timestamp: 0
  };

  evaluate(context: StrategyContext): SignalType {
    const { candles, position, symbol, timeframe, debug } = context;
    const currentCandle = candles[candles.length - 1];
    const currentLow = currentCandle[3];
    const currentHigh = currentCandle[2];
    const currentClose = currentCandle[4];

    // 1. Анализ тренда на 4H
    const ht4h = getHigherTimeframeCandles(candles, '4h');
    if (!ht4h || ht4h.length < 50) return 'hold';

    const sma50_4h = getSMA(ht4h.map(c => c[4]), 50);
    const trendDirection = currentClose > sma50_4h[sma50_4h.length - 1]
      ? 'bullish'
      : 'bearish';

    // 2. Поиск зон ликвидности с повышенной чувствительностью
    const liquidityZones = findLiquidityZones(candles, 2);

    // 3. Обновление свинговых точек с уменьшенным lookback
    this.updateSwingPoints(candles, 2);

    // 4. Импульс RSI
    const closes = candles.map(c => c[4]);
    const rsi = getRSI(closes, 14);
    const lastRsi = rsi[rsi.length - 1];
    const prevRsi = rsi[rsi.length - 2] || 50;

    const isBullishImpulse = lastRsi > 45 && lastRsi > prevRsi;
    const isBearishImpulse = lastRsi < 55 && lastRsi < prevRsi;

    // 5. Поиск ордер-блоков
    const orderBlocks = findOrderBlocks(ht4h);

    // 6. Расчет ATR для риск-менеджмента
    const atrArray = getATR(candles, 14);
    const atr = atrArray.length > 0 ? atrArray[atrArray.length - 1] : 0;

    // 7. Определение точек входа
    const entrySignal = this.calculateEntrySignal(
      candles,
      trendDirection,
      liquidityZones,
      orderBlocks,
      isBullishImpulse,
      isBearishImpulse
    );

    // 8. Риск-менеджмент только для сигналов buy/sell
    if (entrySignal === 'buy' || entrySignal === 'sell') {
      const stopLossLevel = entrySignal === 'buy'
        ? currentLow - atr * 0.5
        : currentHigh + atr * 0.5;

      const riskReward = calculateRiskReward(
        entrySignal,
        currentClose,
        stopLossLevel
      );

      // Пониженные требования к R/R
      if (riskReward >= 1.5 || (riskReward >= 1.2 && (isBullishImpulse || isBearishImpulse))) {
        if (debug) {
          this.logger.debug(
            `[${symbol} ${timeframe}] ${entrySignal.toUpperCase()} signal | ` +
            `Risk/Reward: ${riskReward.toFixed(2)} | ATR: ${atr.toFixed(4)}`
          );
        }

        // Обновляем последний сигнал импульса
        if (isBullishImpulse) this.lastImpulseSignal = { type: 'bullish', timestamp: currentCandle[0] };
        if (isBearishImpulse) this.lastImpulseSignal = { type: 'bearish', timestamp: currentCandle[0] };

        return entrySignal;
      }
    }

    // 9. Управление позицией
    if (position.type !== 'none') {
      return this.managePosition(
        position,
        currentClose,
        currentCandle[0],
        atr,
        debug
      );
    }

    return 'hold';
  }

  private updateSwingPoints(candles: Candle[], lookback: number): void {
    if (candles.length < lookback * 2) return;

    const currentCandle = candles[candles.length - 1];
    const currentHigh = currentCandle[2];
    const currentLow = currentCandle[3];

    // Проверка на свинг-хай
    let isSwingHigh = true;
    for (let i = 1; i <= lookback; i++) {
      const prevHigh = candles[candles.length - 1 - i][2];
      const nextHigh = candles[candles.length - 1 + i]?.[2] || currentHigh;

      if (prevHigh > currentHigh || nextHigh > currentHigh) {
        isSwingHigh = false;
        break;
      }
    }

    // Проверка на свинг-лоу
    let isSwingLow = true;
    for (let i = 1; i <= lookback; i++) {
      const prevLow = candles[candles.length - 1 - i][3];
      const nextLow = candles[candles.length - 1 + i]?.[3] || currentLow;

      if (prevLow < currentLow || nextLow < currentLow) {
        isSwingLow = false;
        break;
      }
    }

    if (isSwingHigh) {
      this.swingHighs.push(currentHigh);
      if (this.swingHighs.length > 10) this.swingHighs.shift();
    }

    if (isSwingLow) {
      this.swingLows.push(currentLow);
      if (this.swingLows.length > 10) this.swingLows.shift();
    }
  }

  private calculateEntrySignal(
    candles: Candle[],
    trend: 'bullish' | 'bearish',
    liquidityZones: { high: number[]; low: number[] },
    orderBlocks: { bullish: Candle[]; bearish: Candle[] },
    bullishImpulse: boolean,
    bearishImpulse: boolean
  ): SignalType {
    const currentCandle = candles[candles.length - 1];
    const currentLow = currentCandle[3];
    const currentHigh = currentCandle[2];
    const prevCandle = candles[candles.length - 2];

    // Проверка на взятие ликвидности
    const takeLiquidityAbove = liquidityZones.high.some(
      zone => currentHigh > zone && prevCandle[2] <= zone
    );

    const takeLiquidityBelow = liquidityZones.low.some(
      zone => currentLow < zone && prevCandle[3] >= zone
    );

    // Проверка подхода к ордер-блоку
    const nearBullishBlock = orderBlocks.bullish.some(
      block => Math.abs(currentLow - block[3]) < (block[2] - block[3]) * 0.2
    );

    const nearBearishBlock = orderBlocks.bearish.some(
      block => Math.abs(currentHigh - block[2]) < (block[2] - block[3]) * 0.2
    );

    // Бычьи условия
    const bullConditions = trend === 'bullish' &&
      (takeLiquidityBelow || nearBullishBlock) &&
      bullishImpulse;

    // Медвежьи условия
    const bearConditions = trend === 'bearish' &&
      (takeLiquidityAbove || nearBearishBlock) &&
      bearishImpulse;

    if (bullConditions) return 'buy';
    if (bearConditions) return 'sell';

    return 'hold';
  }

  private managePosition(
    position: PositionInfo,
    currentPrice: number,
    currentTime: number,
    atr: number,
    debug: boolean
  ): SignalType {
    const timeInTrade = (currentTime - position.entryTimestamp) / 60000; // в минутах
    const profit = position.type === 'long'
      ? (currentPrice - position.entryPrice) / position.entryPrice
      : (position.entryPrice - currentPrice) / position.entryPrice;

    // Динамические уровни на основе волатильности
    const dynamicTakeProfit = position.type === 'long'
      ? position.entryPrice + atr * 1.5
      : position.entryPrice - atr * 1.5;

    const dynamicStopLoss = position.type === 'long'
      ? position.entryPrice - atr * 0.75
      : position.entryPrice + atr * 0.75;

    // Выход по волатильности
    if (position.type === 'long' && currentPrice >= dynamicTakeProfit) {
      if (debug) this.logger.debug(`Take profit hit (volatility): ${(profit * 100).toFixed(2)}%`);
      return 'close-long';
    }

    if (position.type === 'short' && currentPrice <= dynamicTakeProfit) {
      if (debug) this.logger.debug(`Take profit hit (volatility): ${(profit * 100).toFixed(2)}%`);
      return 'close-short';
    }

    if (position.type === 'long' && currentPrice <= dynamicStopLoss) {
      if (debug) this.logger.debug(`Stop loss hit (volatility): ${(profit * 100).toFixed(2)}%`);
      return 'close-long';
    }

    if (position.type === 'short' && currentPrice >= dynamicStopLoss) {
      if (debug) this.logger.debug(`Stop loss hit (volatility): ${(profit * 100).toFixed(2)}%`);
      return 'close-short';
    }

    // Фиксированные уровни как резерв
    if (profit >= 0.03) { // TP 3%
      if (debug) this.logger.debug(`Take profit hit (fixed): ${(profit * 100).toFixed(2)}%`);
      return position.type === 'long' ? 'close-long' : 'close-short';
    }

    if (profit <= -0.015) { // SL 1.5%
      if (debug) this.logger.debug(`Stop loss hit (fixed): ${(profit * 100).toFixed(2)}%`);
      return position.type === 'long' ? 'close-long' : 'close-short';
    }

    // Закрытие по времени (45 минут)
    if (timeInTrade > 45) {
      if (debug) this.logger.debug(`Position closed by time (${timeInTrade.toFixed(0)} minutes)`);
      return position.type === 'long' ? 'close-long' : 'close-short';
    }

    return 'hold';
  }
}