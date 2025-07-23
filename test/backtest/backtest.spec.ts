import { Test, TestingModule } from '@nestjs/testing';
import { BacktestService } from '../../src/modules/backtest/backtest.service';
import { WalletService } from '../../src/modules/wallet/wallet.service';
import { BinanceService } from '../../src/modules/binance/binance.service';
import { TradeLoggerService } from '../../src/modules/logger/trade-logger.service';
import {
  IStrategy,
  SignalType,
  StrategyContext
} from '../../src/modules/strategy/core/strategy.interface';

class MockStrategy implements IStrategy {
  evaluate = jest.fn<SignalType, [StrategyContext]>(() => 'buy');
}

const mockBinanceService = {
  fetchOHLCV: jest.fn()
};

let balanceUSD = 1000;
let balanceAsset = 0;

const mockWalletService = {
  reset: jest.fn((amount: number) => {
    balanceUSD = amount;
    balanceAsset = 0;
  }),
  getBalanceUSD: jest.fn(() => balanceUSD),
  getBalanceAsset: jest.fn(() => balanceAsset),
  simulateBuy: jest.fn((price: number) => {
    const size = 1;
    balanceUSD = 0;
    balanceAsset = size;
    return size;
  }),
  simulateSell: jest.fn((price: number) => {
    const revenue = 1005;
    balanceUSD = revenue;
    balanceAsset = 0;
    return revenue;
  }),
  getInitialBalance: jest.fn(() => 1000)
};

const mockLogger = {
  log: jest.fn(),
  logTrade: jest.fn(),
  logSummary: jest.fn()
};

const candles = Array.from({ length: 60 }, (_, i) => [
  Date.now() + i * 60_000, // timestamp
  100 + i,
  105 + i,
  95 + i,
  100 + i,
  10 // OHLCV
]);

describe('BacktestService', () => {
  let service: BacktestService;
  let strategy: MockStrategy;

  beforeEach(async () => {
    strategy = new MockStrategy();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BacktestService,
        { provide: BinanceService, useValue: mockBinanceService },
        { provide: WalletService, useValue: mockWalletService },
        { provide: TradeLoggerService, useValue: mockLogger },
        { provide: 'STRATEGIES', useValue: [strategy] }
      ]
    }).compile();

    service = module.get<BacktestService>(BacktestService);
    // сбрасываем состояния между тестами
    balanceUSD = 1000;
    balanceAsset = 0;
    jest.clearAllMocks();
  });

  it('should run backtest with one buy signal', async () => {
    mockBinanceService.fetchOHLCV.mockResolvedValueOnce(candles);
    strategy.evaluate.mockReturnValueOnce('buy');

    const result = await service.runBacktest('BNB/USDT', '15m', 50, 'mock', 1000, false);

    expect(result.finalBalance).toBeDefined();
    expect(mockWalletService.simulateBuy).toHaveBeenCalled();
    expect(mockLogger.logTrade).toHaveBeenCalled();
    expect(mockLogger.logSummary).toHaveBeenCalled();
  });

  it('should throw if no candles', async () => {
    mockBinanceService.fetchOHLCV.mockResolvedValueOnce([]);

    await expect(service.runBacktest('BNB/USDT', '15m', 50, 'mock', 1000)).rejects.toThrow(
      'No candles data received'
    );
  });

  it('should throw if strategy not found', async () => {
    await expect(service.runBacktest('BNB/USDT', '15m', 50, 'notExist', 1000)).rejects.toThrow(
      'Strategy notExist not found'
    );
  });

  it('should preserve initial balance before trades', async () => {
    mockBinanceService.fetchOHLCV.mockResolvedValueOnce(candles);
    strategy.evaluate.mockReturnValueOnce('buy');

    await service.runBacktest('BNB/USDT', '15m', 50, 'mock', 1000, false);

    expect(mockWalletService.reset).toHaveBeenCalledWith(1000);
    expect(mockWalletService.getInitialBalance()).toBe(1000);
  });

  it('should calculate totalValue correctly after buy and sell', async () => {
    mockBinanceService.fetchOHLCV.mockResolvedValueOnce(candles);

    strategy.evaluate = jest.fn<SignalType, [StrategyContext]>((ctx) => {
      if (ctx.position.type === 'none') return 'buy';
      if (ctx.position.type === 'long') return 'sell';
      return 'hold';
    });

    const summary = await service.runBacktest('BNB/USDT', '15m', 50, 'mock', 1000, false);

    expect(summary.totalValue).toBeGreaterThan(1000);
    expect(summary.returnPct).toBeGreaterThan(0);
  });
});
