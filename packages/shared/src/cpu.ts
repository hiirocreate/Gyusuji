import { ITEM, ITEMS } from './data/index.js';
import type { Game } from './rules.js';
import { canAcquire, has } from './rules.js';
import { Rand } from './rng.js';
import type { Ask, CpuLevel, Input, PlayerState } from './types.js';

/**
 * CPU 思考（§9, §16）。極かどうかは参照しない。
 * rand はゲーム本体とは別の乱数を使う（入力ログに記録されるのでリプレイには影響しない）。
 */
export function cpuDecide(g: Game, ask: Ask, rand: Rand, level: CpuLevel = g.settings.cpuLevel): Input {
  const p = g.players[ask.seat];
  const itemRate = level === 'weak' ? 0.5 : 1;
  const chance = (pct: number) => rand.chance(pct * itemRate);
  const slotOf = (id: number) => (ask.kind === 'select' ? -1 : ask.items.find((s) => p.items[s]?.id === id) ?? -1);
  const use = (id: number): Input | null => {
    const s = slotOf(id);
    return s >= 0 ? { type: 'useItem', slot: s } : null;
  };

  if (ask.kind === 'action' || ask.kind === 'battle') {
    // 1. HP半分以下なら75%で回復
    if (p.hp <= p.maxHp / 2 && chance(75)) {
      const r = (p.mp >= 4 ? use(ITEM.mag_heal) : null) ?? use(ITEM.apple);
      if (r) return r;
    }
    if (ask.kind === 'battle') return battleChoice(p, use);
    // 2. 呪い
    if (p.cursed) {
      const r = use(ITEM.mag_heal);
      if (r) return r;
    }
    // 3. 遅れていればぱるぷん玉→ひよこ
    const avg = g.players.reduce((a, q) => a + q.steps, 0) / g.players.length;
    const top = Math.max(...g.players.map((q) => q.steps));
    if (level === 'strong' && top - p.steps >= 10) {
      const r = use(ITEM.piyo);
      if (r) return r;
    }
    if (p.steps < avg - 10 && chance(20)) {
      const r = use(ITEM.paru) ?? use(ITEM.piyo);
      if (r) return r;
    }
    // 4. 幸運
    if (p.mp >= 5 && chance(5)) {
      const r = use(ITEM.mag_luck);
      if (r) return r;
    }
    // 5. アミュレット
    if (p.steps - p.respawn.steps >= 25 && chance(20)) {
      const r = use(ITEM.amulet);
      if (r) return r;
    }
    // 6. ノロイ→吸収玉
    if (chance(10)) {
      const r = use(ITEM.curse) ?? use(ITEM.absorb);
      if (r) return r;
    }
    return { type: 'roll' };
  }

  const enabled = ask.options.map((o, i) => ({ o, i })).filter((x) => !x.o.disabled);
  const pickRandom = () => ({ type: 'select', index: rand.pick(enabled).i }) as Input;
  const sel = (i: number): Input => ({ type: 'select', index: i });
  switch (ask.sub) {
    case 'treasure':
      return sel(rand.chance(level === 'weak' ? 70 : 90) ? 0 : 1);
    case 'inn': {
      const th = level === 'strong' ? 0.7 : 0.5;
      const need = p.hp < p.maxHp * th || (level !== 'strong' && p.mp < p.maxMp / 2);
      return sel(need && !ask.options[0].disabled ? 0 : 1);
    }
    case 'branch':
      if (level === 'strong') return sel(p.hp >= p.maxHp * 0.6 ? ask.options.length - 1 : 0);
      return sel(rand.int(ask.options.length));
    case 'shoes':
    case 'qbox':
      return pickRandom();
    case 'shop':
    case 'smith':
      return shopChoice(p, ask, rand, level);
    case 'casino_bet':
      return sel(p.gold >= 100 && rand.chance(30) && !ask.options[0].disabled ? 0 : ask.options.length - 1);
    case 'casino_pick':
      return sel(rand.int(2));
  }
  return sel(ask.def);
}

function battleChoice(p: PlayerState, use: (id: number) => Input | null): Input {
  if (p.mp >= 10) {
    const r = use(ITEM.mag_summon);
    if (r) return r;
  }
  if (p.mp >= 2) {
    const r = use(ITEM.mag_fire);
    if (r) return r;
  }
  return { type: 'battleAttack' };
}

const STRONG_PRIORITY = [ITEM.sword_orb, ITEM.iron_sword, ITEM.iron_shield, ITEM.elixir];

function shopChoice(p: PlayerState, ask: Extract<Ask, { kind: 'select' }>, rand: Rand, level: CpuLevel): Input {
  const none = ask.options.length - 1;
  if (rand.chance(20)) return { type: 'select', index: none };
  const cand = ask.options
    .map((o, i) => ({ o, i, id: o.value ?? 0 }))
    .filter((c) => c.id && !c.o.disabled && !has(p, c.id) && canAcquire(p, c.id))
    .filter((c) => ITEMS[c.id].kind !== 'magic' || p.maxMp > 0)
  if (level === 'strong') {
    cand.sort((a, b) => {
      const pa = STRONG_PRIORITY.indexOf(a.id as never);
      const pb = STRONG_PRIORITY.indexOf(b.id as never);
      return (pa < 0 ? 99 : pa) - (pb < 0 ? 99 : pb) || (ITEMS[b.id].price ?? 0) - (ITEMS[a.id].price ?? 0);
    });
  } else {
    cand.sort((a, b) => (ITEMS[b.id].price ?? 0) - (ITEMS[a.id].price ?? 0));
  }
  for (const c of cand) if (rand.chance(80)) return { type: 'select', index: c.i };
  return { type: 'select', index: none };
}
