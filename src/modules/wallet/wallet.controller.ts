import { Controller, Get, Query } from '@nestjs/common';
import { WalletService } from './wallet.service';

@Controller('/wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get('/history')
  async history() {
    return this.walletService.getTradeHistory();
  }

  @Get('/balance')
  async balance() {
    return (
      'USD: ' + this.walletService.getBalanceUSD() + ' ASSET' + this.walletService.getBalanceAsset()
    );
  }

  @Get('/buyCrypto')
  async buyCrypto(@Query('quantity') quantity: number) {
    return this.walletService.simulateBuy(quantity);
  }

  @Get('/sellCrypto')
  async sellCrypto(@Query('quantity') quantity: number) {
    return this.walletService.simulateSell(quantity);
  }
}
