const TF_MS: Record<string, number> = {
  '1m': 60_000,
  '3m': 180_000,
  '5m': 300_000,
  '15m': 900_000,
  '30m': 1_800_000,
  '1h': 3_600_000,
  '2h': 7_200_000,
  '4h': 14_400_000,
  '6h': 21_600_000,
  '8h': 28_800_000,
  '12h': 43_200_000,
  '1d': 86_400_000,
};

export function timeframeToMs(tf: string): number {
  const v = TF_MS[tf];
  if (!v) {
    throw new Error(`Unsupported timeframe: ${tf}`);
  }
  return v;
}

export function calcLimitFromRange(
  timeframe: string,
  fromMs: number,
  toMs: number,
  warmupBars = 300
): number {
  const tfMs = timeframeToMs(timeframe);
  if (toMs <= fromMs) throw new Error(`Invalid range: from ${fromMs} >= to ${toMs}`);
  const bars = Math.ceil((toMs - fromMs) / tfMs);
  return bars + Math.max(0, Math.floor(warmupBars));
}
