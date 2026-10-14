import { describe, expect, it } from 'vitest';
import {
  C, CHARS, DEFAULT_SETTINGS, ENEMIES, Game, GameMap, ITEM, MAPS, Runner, TREASURE_TABLE, giveItem, hurt, rng, shopStock,
} from '../src/index.js';
import type { MapId } from '../src/index.js';
import { seats, simulate } from './sim.js';

describe('データ', () => {
  it('キャラ初期値', () => {
    expect(CHARS.map((c) => [c.hp, c.mp, c.luck])).toEqual([[14, 10, 2], [12, 14, 0], [10, 20, 4], [15, 0, 1], [12, 14, 2]]);
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
