import { Injectable } from '@nestjs/common';

@Injectable()
export class WalletService {
  private initialBalance: number = 0;
  private balanceUSD: number = 0;
  private balanceAsset: number = 0;
  private tradeHistory: Array<{
    type: 'buy' | 'sell';
    price: number;
    amount: number;
    timestamp?: number;
  }> = [];

  reset(initialBalance: number = 10000): void {
    this.initialBalance = initialBalance;
    this.balanceUSD = initialBalance;
    this.balanceAsset = 0;
    this.tradeHistory = [];
  }

  getBalanceUSD(): number {
    return this.balanceUSD;
  }

  getBalanceAsset(): number {
    return this.balanceAsset;
  }

  getInitialBalance(): number {
    return this.initialBalance;
  }

  getTradeHistory() {
    return [...this.tradeHistory];
  }

  simulateBuy(price: number, amountUSD?: number, timestamp?: number): number {
    const buyAmountUSD = amountUSD || this.balanceUSD;
    if (buyAmountUSD > this.balanceUSD) {
      throw new Error('Insufficient USD balance');
    }

    const qty = buyAmountUSD / price;
    this.balanceAsset += qty;
    this.balanceUSD -= buyAmountUSD;

    this.tradeHistory.push({
      type: 'buy',
      price,
      amount: qty,
      timestamp
    });

    return qty;
  }

  simulateSell(price: number, amountAsset?: number, timestamp?: number): number {
    const sellAmountAsset = amountAsset || this.balanceAsset;
    if (sellAmountAsset > this.balanceAsset) {
      throw new Error('Insufficient asset balance');
    }

    const revenue = sellAmountAsset * price;
    this.balanceUSD += revenue;
    this.balanceAsset -= sellAmountAsset;

    this.tradeHistory.push({
      type: 'sell',
      price,
      amount: sellAmountAsset,
      timestamp
    });

    return revenue;
  }

  calculatePortfolioValue(currentPrice: number): number {
    return this.balanceUSD + (this.balanceAsset * currentPrice);
  }

  getPortfolioChange(currentPrice: number): number {
    if (this.initialBalance === 0) return 0;
    const currentValue = this.calculatePortfolioValue(currentPrice);
    return ((currentValue - this.initialBalance) / this.initialBalance) * 100;
  }
}