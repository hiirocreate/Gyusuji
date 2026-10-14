/** mulberry32: 32bit シード付き PRNG */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mix(h: number, v: number): number {
  h = Math.imul(h ^ (v >>> 0), 0x9e3779b1);
  return (h ^ (h >>> 16)) >>> 0;
}

/** マス座標から派生する乱数（原作のマップ乱数の再現）。0 以上の整数を返す */
export function rng(seed: number, x: number, y: number, counter: number): number {
  let h = mix(0x811c9dc5, seed);
  h = mix(h, x);
  h = mix(h, y);
  h = mix(h, counter);
  return Math.floor(mulberry32(h)() * 0x7fffffff);
}

/** ゲーム進行用の乱数ストリーム */
export class Rand {
  private next: () => number;
  constructor(public readonly seed: number) {
    this.next = mulberry32(seed);
  }
  float(): number {
    return this.next();
  }
  int(n: number): number {
    return Math.floor(this.next() * n);
  }
  chance(percent: number): boolean {
    return this.next() * 100 < percent;
  }
  die(): number {
    return this.int(6) + 1;
  }
  dice(n: number): number[] {
    return Array.from({ length: n }, () => this.die());
  }
  pick<T>(arr: readonly T[]): T {
    return arr[this.int(arr.length)];
  }
}
