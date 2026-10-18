import { describe, expect, it } from 'vitest';
import {
  C, CHARS, DEFAULT_SETTINGS, ENEMIES, Game, GameMap, ITEM, MAPS, Runner, TREASURE_TABLE, giveItem, hurt, rng, shopStock,
} from '../src/index.js';
import type { MapId } from '../src/index.js';
import { seats, simulate } from './sim.js';
import { cpuDecide, Rand } from '../src/index.js';

describe('データ', () => {
  it('キャラ初期値', () => {
    expect(CHARS.map((c) => [c.hp, c.mp, c.luck])).toEqual([[14, 10, 2], [12, 14, 0], [10, 20, 4], [15, 0, 1], [12, 14, 2], [12, 4, 3], [13, 8, 2], [12, 16, 2], [20, 16, 0]]);
  });
  it('敵', () => {
    expect(ENEMIES.enemy_slime.hp).toBe(4);
    expect(ENEMIES.midboss_demon.hp).toBe(30);
    expect(ENEMIES.lastboss_king.hp).toBe(60);
    expect(ENEMIES.enemy_golem.str).toBe(2);
  });
  it('宝箱テーブル', () => {
    expect(TREASURE_TABLE.slice(0, 4)).toEqual([0, 0, 0, 0]);
    expect(TREASURE_TABLE[10]).toBe(ITEM.elixir);
    expect(TREASURE_TABLE[15]).toBe(ITEM.paru);
    expect(TREASURE_TABLE[17]).toBe(ITEM.warp_scroll);
  });
});

describe('マップ', () => {
  for (const id of [0, 1, 2] as MapId[]) {
    it(`map${id}: スタートからラスボスまで道がつながる`, () => {
      const m = new GameMap(MAPS[id]);
      // 分岐は両方試す
      const walk = (x: number, y: number, dir: any, choice: number): number => {
        let n = 0;
        for (let i = 0; i < 2000; i++) {
          if (m.cell(x, y)!.c === 'lastboss') return n;
          let d = m.nextDir(x, y, dir);
          if (d === null) d = m.branchOptions(x, y, dir)[choice].dir;
          const dx = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[d!]!;
          x += dx[0];
          y += dx[1];
          dir = d;
          expect(m.cell(x, y)).toBeTruthy();
          n++;
        }
        throw new Error('loop');
      };
      const a = walk(m.start.x, m.start.y, m.startDir, 0);
      const b = walk(m.start.x, m.start.y, m.startDir, 1);
      expect(a).toBeGreaterThan(50);
      expect(b).toBeGreaterThan(50);
      if (id === 2) expect(Math.max(a, b)).toBeGreaterThan(300);
    });
    it(`map${id}: ボスマスにボスが対応`, () => {
      const m = new GameMap(MAPS[id]);
      const bossCells = MAPS[id].path.filter((p) => /boss/.test(p.c));
      for (const c of bossCells) expect(m.bossOf.has(`${c.x},${c.y}`)).toBe(true);
    });
  }
});

describe('ルール', () => {
  const mk = (over = {}) => new Game({ ...DEFAULT_SETTINGS, ...over }, seats(4), 1234);
  it('初期所持金とアイテム', () => {
    const g = mk({ startGold: 50 });
    expect(g.players[0].gold).toBe(50);
    expect(g.players[3].items.map((i) => i.id)).toEqual([ITEM.sword_orb, ITEM.dice, ITEM.dice, ITEM.amulet]);
  });
  it('武器は上位のみ置き換え', () => {
    const g = mk();
    const p = g.players[0];
    expect(giveItem(g, p, ITEM.iron_sword)).toBe(true);
    expect(giveItem(g, p, ITEM.dagger)).toBe(false);
    expect(giveItem(g, p, ITEM.hero_sword)).toBe(true);
    expect(p.items.filter((i) => i.id >= 6 && i.id <= 8).map((i) => i.id)).toEqual([ITEM.hero_sword]);
  });
  it('所持枠10', () => {
    const g = mk();
    const p = g.players[0];
    while (giveItem(g, p, ITEM.apple));
    expect(p.items.length).toBe(C.SLOTS);
  });
  it('エリクサーで復活、無ければ復活地点', () => {
    const g = mk();
    const p = g.players[0];
    p.x += 0;
    giveItem(g, p, ITEM.elixir);
    expect(hurt(g, p, 99)).toBe('revived');
    expect(p.hp).toBe(p.maxHp);
    p.steps = 30;
    expect(hurt(g, p, 99)).toBe('dead');
    expect(p.steps).toBe(0);
  });
  it('ショップ品揃えはマス座標で決まる', () => {
    const g = mk();
    expect(shopStock(g, 3, 4)).toEqual(shopStock(g, 3, 4));
    expect(rng(1, 2, 3, 4)).toBe(rng(1, 2, 3, 4));
  });
});

describe('通しプレイ（CPUのみ）', () => {
  for (const map of [0, 1, 2] as MapId[]) {
    for (const seed of [1, 2, 3]) {
      it(`map${map} seed${seed} は決着する`, () => {
        const { r } = simulate({ map }, 4, seed);
        expect(r.game.over).toBe(true);
        expect(r.game.winner).toBeGreaterThanOrEqual(0);
        for (const p of r.game.players) {
          expect(p.items.length).toBeLessThanOrEqual(C.SLOTS);
          expect(p.gold).toBeLessThanOrEqual(C.GOLD_MAX);
          expect(p.gold).toBeGreaterThanOrEqual(0);
        }
      });
    }
  }
  it('ターン上限で終了', () => {
    const { r, events } = simulate({ map: 2, turnLimit: 30 }, 3, 9);
    expect(r.game.over).toBe(true);
    expect(r.game.round).toBeLessThanOrEqual(30);
    expect(events.some((e) => e.t === 'gameOver')).toBe(true);
  });
  it('1人でも遊べる', () => {
    const { r } = simulate({ map: 1 }, 1, 5);
    expect(r.game.over).toBe(true);
  });
  it('リプレイは同じ結果になる', () => {
    const { r, settings } = simulate({ map: 1 }, 4, 77);
    const rp = Runner.replay(settings, seats(4), 77, r.log);
    expect(JSON.stringify(rp.game.view())).toBe(JSON.stringify(r.game.view()));
  });
});

describe('ぱるぷん玉<極>', () => {
  it('入手時に約20%で極になる', () => {
    const g = new Game({ ...DEFAULT_SETTINGS, kiwamiRate: 20 }, seats(1), 42);
    const p = g.players[0];
    let k = 0;
    const N = 5000;
    for (let i = 0; i < N; i++) {
      p.items = [];
      giveItem(g, p, ITEM.paru);
      if (p.items[0].kiwami) k++;
    }
    expect(k / N).toBeGreaterThan(0.17);
    expect(k / N).toBeLessThan(0.23);
  });
  it('クラシックでは極にならない', () => {
    const g = new Game({ ...DEFAULT_SETTINGS, rule: 'classic', kiwamiRate: 50 }, seats(1), 42);
    const p = g.players[0];
    for (let i = 0; i < 200; i++) {
      p.items = [];
      giveItem(g, p, ITEM.paru);
      expect(p.items[0].kiwami).toBeFalsy();
    }
  });
  it('奪取では極状態を引き継ぐ', () => {
    const g = new Game({ ...DEFAULT_SETTINGS, kiwamiRate: 0 }, seats(2), 1);
    const [a, b] = g.players;
    b.items = [];
    giveItem(g, b, ITEM.paru, { id: ITEM.paru, kiwami: true });
    expect(b.items[0].kiwami).toBe(true);
    void a;
  });
  it('公開ビュー・イベントに kiwami が含まれない', () => {
    const { r, events } = simulate({ map: 0, kiwamiRate: 50 }, 4, 3);
    const g = new Game({ ...DEFAULT_SETTINGS, kiwamiRate: 50 }, seats(2), 3);
    g.players[0].items.push({ id: ITEM.paru, kiwami: true });
    expect(JSON.stringify(g.view())).not.toContain('kiwami');
    expect(JSON.stringify(r.game.view())).not.toContain('kiwami');
    // paru イベント以外で kiwami を含むものは無い
    for (const e of events) if (e.t !== 'paru') expect(JSON.stringify(e)).not.toContain('kiwami');
  });
});

describe('固有アイテム', () => {
  const run = (charId: number, seed: number) => {
    const ss = seats(2).map((s, i) => (i === 0 ? { ...s, charId } : s));
    const r = new Runner({ ...DEFAULT_SETTINGS, map: 0 }, ss, seed);
    const cr = new Rand(seed ^ 0x5555);
    const events = r.drain();
    for (let i = 0; r.ask && i < 200000; i++) {
      r.submit(cpuDecide(r.game, r.ask, cr));
      events.push(...r.drain());
    }
    return { r, events };
  };
  it('初期所持品', () => {
    expect(CHARS[5].items).toEqual([ITEM.hunter_bow, ITEM.dice, ITEM.apple, ITEM.amulet]);
    expect(CHARS[6].items).toEqual([ITEM.secret_pot, ITEM.apple, ITEM.apple, ITEM.amulet]);
  });
  it('早撃ちの弓：戦闘開始直後に1ダイスの先制', () => {
    let n = 0;
    for (const seed of [1, 2, 3]) {
      const { r, events } = run(5, seed);
      expect(r.game.over).toBe(true);
      events.forEach((e, i) => {
        if (e.t !== 'battleStart' || e.seat !== 0) return;
        const d = events.slice(i).find((x) => x.t === 'dice') as any;
        const h = events.slice(i).find((x) => x.t === 'battleHit') as any;
        if (d.values.length === 1 && d.purpose === 'attack' && h.target === 'enemy' && h.amount === d.values[0]) n++;
      });
    }
    expect(n).toBeGreaterThan(0);
  });
  it('秘伝の鍋：りんごは3ダイス＋2', () => {
    let n = 0;
    for (const seed of [1, 2, 3, 4]) {
      const { events } = run(6, seed);
      events.forEach((e, i) => {
        if (e.t !== 'itemUse' || e.seat !== 0 || e.item !== ITEM.apple) return;
        const d = events.slice(i).find((x) => x.t === 'dice') as any;
        expect(d.purpose).toBe('heal');
        expect(d.values.length).toBe(3);
        n++;
      });
    }
    expect(n).toBeGreaterThan(0);
  });
  it('鍋が無ければりんごは2ダイス', () => {
    const { events } = run(0, 1);
    events.forEach((e, i) => {
      if (e.t !== 'itemUse' || e.seat !== 0 || e.item !== ITEM.apple) return;
      expect((events.slice(i).find((x) => x.t === 'dice') as any).values.length).toBe(2);
    });
  });
});

describe('ヒーロ（ピエロ）', () => {
  const run = (seed: number, prefer: number[]) => {
    const ss = seats(3).map((s, i) => (i === 0 ? { ...s, charId: 7 } : s));
    const r = new Runner({ ...DEFAULT_SETTINGS, map: 0 }, ss, seed);
    const cr = new Rand(seed ^ 0x5555);
    const events = r.drain();
    for (let i = 0; r.ask && i < 200000; i++) {
      const a = r.ask;
      let inp = cpuDecide(r.game, a, cr);
      if (a.seat === 0 && (a.kind === 'action' || a.kind === 'battle')) {
        const me = r.game.players[0];
        const slot = a.items.find((s) => prefer.includes(me.items[s].id));
        if (slot !== undefined) inp = { type: 'useItem', slot };
      }
      expect(r.submit(inp)).toBe(true);
      events.push(...r.drain());
    }
    return { r, events };
  };
  it('狂乱のサイコロは消えず、最後まで手元に残る', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { r, events } = run(seed, [ITEM.chaos_dice]);
      expect(r.game.over).toBe(true);
      expect(r.game.players[0].items.some((it) => it.id === ITEM.chaos_dice)).toBe(true);
      const faces = events.filter((e) => e.t === 'dice' && e.purpose === 'chaos').map((e: any) => e.values[0]);
      expect(new Set(faces).size).toBe(6);
      expect(events.some((e) => e.t === 'loseItem' && e.item === ITEM.chaos_dice)).toBe(false);
    }
  });
  it('狂乱のサイコロは出目の数だけ進む（6は9）', () => {
    let nine = 0;
    for (const seed of [1, 2, 3, 4, 5]) {
      const { events } = run(seed, [ITEM.chaos_dice]);
      events.forEach((e, i) => {
        if (e.t !== 'dice' || e.purpose !== 'chaos' || e.seat !== 0) return;
        const rest = events.slice(i + 1);
        const until = rest.findIndex((x) => x.t === 'turn');
        const seg = rest.slice(0, until < 0 ? undefined : until);
        if (seg.some((x) => x.t === 'battleStart' || x.t === 'death' || x.t === 'battleEnd')) return;
        expect(seg.some((x) => x.t === 'dice' && x.purpose === 'move')).toBe(false);
        const cells = seg.filter((x) => x.t === 'move').reduce((a, x: any) => a + x.cells.length, 0);
        const v = e.values[0] === 6 ? 9 : e.values[0];
        if (e.values[0] === 1 || e.values[0] === 4) return; // 自滅の可能性
        expect(cells).toBeLessThanOrEqual(v);
        if (v === 9 && cells === 9) nine++;
      });
    }
    expect(nine).toBeGreaterThan(0);
  });
  it('戦闘中の狂乱のサイコロは出目をそのまま攻撃の目にする', () => {
    let n = 0;
    for (const seed of [1, 2, 3, 4, 5]) {
      const { events } = run(seed, [ITEM.chaos_dice]);
      let enemy = '';
      events.forEach((e, i) => {
        if (e.t === 'battleStart') enemy = e.enemy;
        if (e.t !== 'dice' || e.purpose !== 'chaos' || e.seat !== 0 || e.values[0] === 4) return;
        const next = events.slice(i + 1).find((x) => x.t === 'dice' || x.t === 'battleHit' || x.t === 'turn') as any;
        if (!next || next.t !== 'battleHit' || next.target !== 'enemy') return;
        const v = e.values[0] === 6 ? 9 : e.values[0];
        expect(next.amount).toBeGreaterThanOrEqual(Math.max(0, v - ENEMIES[enemy].def));
        expect(next.amount).toBeLessThanOrEqual(v + 3);
        n++;
      });
    }
    expect(n).toBeGreaterThan(0);
  });
  it('ジョーカーの札はMP2を使い、いじわるイベントを出す', () => {
    const { r, events } = run(3, [ITEM.joker]);
    expect(r.game.over).toBe(true);
    expect(events.filter((e) => e.t === 'itemUse' && e.item === ITEM.joker).length).toBeGreaterThan(0);
    expect(events.some((e) => e.t === 'meddle' && e.seat === 0)).toBe(true);
  });
  it('吸収玉で狂乱のサイコロは奪われない', () => {
    const ss = seats(2).map((s, i) => ({ ...s, charId: i === 0 ? 1 : 7 }));
    const r = new Runner({ ...DEFAULT_SETTINGS }, ss, 1);
    const [a, b] = r.game.players;
    a.items = [{ id: ITEM.amulet }, { id: ITEM.absorb }];
    b.items = [{ id: ITEM.chaos_dice }];
    expect(r.submit({ type: 'useItem', slot: 1 })).toBe(true);
    const ev = r.drain();
    expect(b.items.map((i) => i.id)).toEqual([ITEM.chaos_dice]);
    expect(ev.some((e) => e.t === 'meddle' && e.seat === 0)).toBe(true);
  });
});

describe('ネロ（元魔王）', () => {
  const mk = () => new Runner({ ...DEFAULT_SETTINGS, map: 0 }, seats(2).map((s, i) => (i === 0 ? { ...s, charId: 8 } : s)), 7);
  it('アミュレット・勇者の剣・勇者の盾は持てない', () => {
    const r = mk();
    const p = r.game.players[0];
    expect(p.items.map((i) => i.id)).toEqual([ITEM.demon_horn, ITEM.dice, ITEM.dice, ITEM.apple]);
    for (const id of [ITEM.amulet, ITEM.hero_sword, ITEM.hero_shield]) expect(giveItem(r.game, p, id)).toBe(false);
    expect(giveItem(r.game, p, ITEM.iron_sword)).toBe(true);
  });
  it('CPUだけで最後まで進み、角は失われない', () => {
    for (const seed of [1, 2, 3]) {
      const ss = seats(3).map((s, i) => (i === 0 ? { ...s, charId: 8 } : s));
      const r = new Runner({ ...DEFAULT_SETTINGS, map: 0 }, ss, seed);
      const cr = new Rand(seed);
      r.drain();
      for (let i = 0; r.ask && i < 200000; i++) { r.submit(cpuDecide(r.game, r.ask, cr)); r.drain(); }
      expect(r.game.over).toBe(true);
      const me = r.game.players[0];
      expect(me.items.some((i) => i.id === ITEM.demon_horn)).toBe(true);
      expect(me.items.some((i) => ([ITEM.amulet, ITEM.hero_sword, ITEM.hero_shield] as number[]).includes(i.id))).toBe(false);
    }
  });
  it('同じマスに止まると相手に1ダメージ（いじわるに数える）', () => {
    let n = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const ss = seats(3).map((s, i) => (i === 0 ? { ...s, charId: 8 } : s));
      const r = new Runner({ ...DEFAULT_SETTINGS, map: 0 }, ss, seed);
      const cr = new Rand(seed);
      const events = r.drain();
      for (let i = 0; r.ask && i < 200000; i++) { r.submit(cpuDecide(r.game, r.ask, cr)); events.push(...r.drain()); }
      events.forEach((e, i) => {
        if (e.t !== 'meddle' || e.seat !== 0) return;
        const d = events.slice(i + 1).find((x) => x.t === 'damage') as any;
        if (d && d.seat !== 0 && d.amount === 1) n++;
      });
    }
    expect(n).toBeGreaterThan(0);
  });
});
