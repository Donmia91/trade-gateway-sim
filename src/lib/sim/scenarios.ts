export interface ShockEvent {
  /** Time offset in ms from sim start */
  atMs: number;
  /** Price jump (add to current price) */
  delta: number;
}

export interface Scenario {
  name: string;
  seed: number;
  startPrice: number;
  vol: number;
  drift: number;
  baseSpreadBps: number;
  liquidity: number;
  shockEvents: ShockEvent[];
}

const scenarios: Record<string, Scenario> = {
  CHOP: {
    name: "CHOP",
    seed: 42,
    startPrice: 2.5,
    vol: 0.002,
    drift: 0,
    baseSpreadBps: 8,
    liquidity: 1,
    shockEvents: [],
  },
  TREND_UP: {
    name: "TREND_UP",
    seed: 100,
    startPrice: 2.5,
    vol: 0.001,
    drift: 0.00015,
    baseSpreadBps: 10,
    liquidity: 1,
    shockEvents: [],
  },
  PANIC_DOWN: {
    name: "PANIC_DOWN",
    seed: 200,
    startPrice: 2.5,
    vol: 0.008,
    drift: -0.0004,
    baseSpreadBps: 25,
    liquidity: 0.5,
    shockEvents: [],
  },
  GAP_UP: {
    name: "GAP_UP",
    seed: 300,
    startPrice: 2.5,
    vol: 0.002,
    drift: 0,
    baseSpreadBps: 15,
    liquidity: 0.8,
    shockEvents: [
      { atMs: 5000, delta: 0.15 },
      { atMs: 30000, delta: 0.08 },
    ],
  },
  LOW_LIQUIDITY: {
    name: "LOW_LIQUIDITY",
    seed: 400,
    startPrice: 2.5,
    vol: 0.003,
    drift: 0,
    baseSpreadBps: 50,
    liquidity: 0.2,
    shockEvents: [],
  },
};

export function getScenario(name: string): Scenario | undefined {
  return scenarios[name];
}

export function listScenarios(): Scenario[] {
  return Object.values(scenarios);
}

/** Mulberry32 PRNG for deterministic price path */
export function mulberry32(seed: number): () => number {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t ^ (t >>> 12));
    return ((t >>> 0) / 4294967296) * 2 - 1;
  };
}

/**
 * Next price from scenario params and elapsed ms.
 * Uses drift + vol * rand + shock events.
 */
export function nextPrice(
  scenario: Scenario,
  currentPrice: number,
  elapsedMs: number,
  rand: () => number
): number {
  const dt = 0.001; // per-tick time step for drift
  let price = currentPrice;
  price *= 1 + scenario.drift * dt + scenario.vol * rand();
  for (const shock of scenario.shockEvents) {
    if (elapsedMs >= shock.atMs && elapsedMs < shock.atMs + 500) {
      price += shock.delta;
      break;
    }
  }
  return Math.max(0.01, price);
}
