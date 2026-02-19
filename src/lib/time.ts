export function nowMs(): number {
  return Date.now();
}

export function elapsedSec(startMs: number): number {
  return (nowMs() - startMs) / 1000;
}
