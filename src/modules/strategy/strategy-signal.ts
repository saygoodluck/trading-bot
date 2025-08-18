import { Risk } from './risk';

export enum SignalAction {
  BUY = 'buy',
  SELL = 'sell',
  CLOSE = 'close',
  HOLD = 'hold'
}

export interface Signal {
  action: SignalAction;
  reason?: string;
  confidence?: number;
  risk?: Risk;
}
