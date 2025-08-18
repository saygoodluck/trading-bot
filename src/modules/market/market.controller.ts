import { Controller, Get, Inject } from '@nestjs/common';
import { MARKET_PROVIDER } from './market-provider.factory';
import { MarketProvider } from './market-provider.interface';

@Controller('/market')
export class MarketController{

  constructor(@Inject(MARKET_PROVIDER) private readonly market: MarketProvider) {
  }

  @Get('/account')
  public async account() {
    return await this.market.account();
  }
}