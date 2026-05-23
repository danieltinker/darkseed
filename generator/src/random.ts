// Deterministic PRNG so generation is reproducible.
// mulberry32 — small, fast, good distribution for non-crypto use.

export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(rng: Rng, arr: readonly T[]): T {
  if (arr.length === 0) throw new Error("pick: empty array");
  return arr[Math.floor(rng() * arr.length)]!;
}

export function pickN<T>(rng: Rng, arr: readonly T[], n: number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  const k = Math.min(n, copy.length);
  for (let i = 0; i < k; i++) {
    const idx = Math.floor(rng() * copy.length);
    out.push(copy.splice(idx, 1)[0]!);
  }
  return out;
}

export function intBetween(rng: Rng, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

export function chance(rng: Rng, p: number): boolean {
  return rng() < p;
}

export function randomHex(rng: Rng, bytes: number): string {
  let out = "";
  const chars = "0123456789abcdef";
  for (let i = 0; i < bytes * 2; i++) out += chars[Math.floor(rng() * 16)];
  return out;
}

export function randomSha256(rng: Rng): string {
  return randomHex(rng, 32);
}

export function randomMd5(rng: Rng): string {
  return randomHex(rng, 16);
}
