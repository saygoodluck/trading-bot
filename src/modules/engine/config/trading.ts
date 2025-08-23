export const TradingDefaults = {
  executor: {
    startCash: 1000,
    leverage: 10,
    takerFee: 0.0004,
    makerFee: 0.0002,
    maintenanceMarginRate: 0.005,
    execMode: 'market_next_open' as const
  },
  engine: {
    riskPct: 0.01,
    defaultAtrMult: 2,
    tpRR: 1.5,
    risk: {
      dailyLossStopPct: 2,
      dailyProfitStopPct: 2,
      maxTradesPerDay: 25,
      dynamicRiskScaling: true,
      hardStop: {
        enabled: true,
        atrPeriod: 14,
        atrMult: 2.5,
        neverLoosen: true,
        basis: 'avgEntry' as const
      }
    },
    regime: {
      trendFilter: { kind: 'SMA' as const, period: 100, bias: 'both' as const }
    }
  }
};
