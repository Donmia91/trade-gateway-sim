/**
 * Kraken Pro spot fee tiers by 30-day volume (USD).
 * Ref: https://www.kraken.com/features/fee-schedule
 */

export interface FeeTier {
  minVolumeUsd: number;
  makerBps: number;
  takerBps: number;
  label: string;
}

/** Ascending by minVolumeUsd. */
export const KRAKEN_SPOT_TIERS: FeeTier[] = [
  { minVolumeUsd: 0, makerBps: 25, takerBps: 40, label: "Tier 0 ($0+)" },
  { minVolumeUsd: 10_000, makerBps: 20, takerBps: 35, label: "Tier 1 ($10k+)" },
  { minVolumeUsd: 50_000, makerBps: 14, takerBps: 24, label: "Tier 2 ($50k+)" },
  { minVolumeUsd: 100_000, makerBps: 12, takerBps: 22, label: "Tier 3 ($100k+)" },
  { minVolumeUsd: 250_000, makerBps: 10, takerBps: 20, label: "Tier 4 ($250k+)" },
  { minVolumeUsd: 500_000, makerBps: 8, takerBps: 18, label: "Tier 5 ($500k+)" },
  { minVolumeUsd: 1_000_000, makerBps: 6, takerBps: 16, label: "Tier 6 ($1M+)" },
  { minVolumeUsd: 2_500_000, makerBps: 4, takerBps: 14, label: "Tier 7 ($2.5M+)" },
  { minVolumeUsd: 5_000_000, makerBps: 2, takerBps: 12, label: "Tier 8 ($5M+)" },
  { minVolumeUsd: 10_000_000, makerBps: 0, takerBps: 10, label: "Tier 9 ($10M+)" },
];

export function pickKrakenTier(volume30dUsd: number): FeeTier {
  if (!Number.isFinite(volume30dUsd) || volume30dUsd < 0) {
    return KRAKEN_SPOT_TIERS[0];
  }
  let chosen = KRAKEN_SPOT_TIERS[0];
  for (const tier of KRAKEN_SPOT_TIERS) {
    if (volume30dUsd >= tier.minVolumeUsd) chosen = tier;
  }
  return chosen;
}

export function calcFeeUsd(
  notionalUsd: number,
  isMaker: boolean,
  volume30dUsd: number
): { feeUsd: number; tier: FeeTier; rateBps: number } {
  const tier = pickKrakenTier(volume30dUsd);
  const rateBps = isMaker ? tier.makerBps : tier.takerBps;
  const feeUsd = notionalUsd * (rateBps / 10_000);
  return { feeUsd, tier, rateBps };
}

export function calcKrakenFeeUsd(params: {
  notionalUsd: number;
  isMaker: boolean;
  volume30dUsd: number;
}): { feeUsd: number; tierLabel: string; rateBps: number } {
  const { feeUsd, tier, rateBps } = calcFeeUsd(
    params.notionalUsd,
    params.isMaker,
    params.volume30dUsd
  );
  return { feeUsd, tierLabel: tier.label, rateBps };
}

/** Paper / reporting: liquidity "maker"|"taker", returns feeUsd and feeRateBps. */
export function calcFeeUsdPaper(params: {
  notionalUsd: number;
  liquidity: "maker" | "taker";
  volume30dUsd: number;
}): { feeUsd: number; feeRateBps: number; tierLabel: string } {
  const isMaker = params.liquidity === "maker";
  const { feeUsd, tier, rateBps } = calcFeeUsd(
    params.notionalUsd,
    isMaker,
    params.volume30dUsd
  );
  return { feeUsd, feeRateBps: rateBps, tierLabel: tier.label };
}
