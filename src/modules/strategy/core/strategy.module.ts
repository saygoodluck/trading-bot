import { Module, Provider } from '@nestjs/common';
import { SmaRsiStrategy } from '../sma-rsi.strategy';
import { BollRsiStrategy } from '../boll-rsi.strategy';
import { EmaBollingerScalpStrategy } from '../ema-bollinger-scalp.strategy';
import { SmartMoneyStrategy } from '../smartmoney.strategy';
import { SwingRsiSmaStrategy } from '../swing-rsi-sma.strategy';
import { IntradayEthStrategy } from '../intraday-eth.strategy';
import { VolumeImpulseStrategy } from '../volume-impulse.strategy';

const strategies = [
  SmaRsiStrategy,
  BollRsiStrategy,
  VolumeImpulseStrategy,
  IntradayEthStrategy,
  SwingRsiSmaStrategy,
  SmartMoneyStrategy,
  EmaBollingerScalpStrategy
];

const strategyProvider: Provider = {
  provide: 'STRATEGIES',
  useFactory: (...instances) => instances,
  inject: strategies
};

@Module({
  providers: [...strategies, strategyProvider],
  exports: ['STRATEGIES']
})
export class StrategyModule {}
