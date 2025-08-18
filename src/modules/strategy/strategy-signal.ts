import { Risk } from './risk';

export class StrategySignal {
  public action: Action;
  public reason: string;
  public confidence: number;
  public risk: Risk;

  constructor(action: Action, risk?: Risk, reason?: string, confidence?: number) {
    this.action = action;
    this.risk = risk;
    this.reason = reason;
    this.confidence = confidence;
  }
}

export type Signal = { action: 'buy'|'sell'|'close'|'hold'; reason?: string; confidence?: number };


export enum Action {
  LONG = 'buy',
  SHORT = 'sell',
  EXIT = 'exit',
  HOLD = 'hold'
}

export enum StrategySignalType1 {
  LONG = 'long',
  SHORT = 'short',
  EXIT = 'exit',
  HOLD = 'hold'
}
