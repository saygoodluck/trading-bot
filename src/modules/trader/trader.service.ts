import { Injectable } from '@nestjs/common';

@Injectable()
export class TraderService {
  async execute(signal: 'buy' | 'sell' | 'hold', symbol: string) {
    if (signal === 'hold') return '📉 Ничего не делаем';

    console.log(`🚀 Выполняем ${signal.toUpperCase()} по ${symbol}`);
    // Тут можно звать binanceService.createOrder()

    return `✅ ${signal.toUpperCase()} выполнено`;
  }
}
