import { cpuDecide, DEFAULT_SETTINGS, Rand, Runner } from '../src/index.js';
import type { SeatInit, Settings } from '../src/index.js';

export function seats(n: number): SeatInit[] {
  return Array.from({ length: n }, (_, i) => ({ name: `CPU${i + 1}`, charId: i % 5, isCpu: true }));
}

/** CPU だけで最後まで進める */
export function simulate(over: Partial<Settings>, n: number, seed: number, maxInputs = 200000) {
  const settings = { ...DEFAULT_SETTINGS, ...over };
  const r = new Runner(settings, seats(n), seed);
  const cr = new Rand(seed ^ 0x5555);
  let i = 0;
  const events = r.drain();
  while (r.ask && i++ < maxInputs) {
    const inp = cpuDecide(r.game, r.ask, cr);
    if (!r.submit(inp)) throw new Error(`CPU input rejected: ${JSON.stringify(inp)} for ${JSON.stringify(r.ask)}`);
    events.push(...r.drain());
  }
  return { r, events, settings };
}
