import { C, CHARS, ENEMIES, ITEM, ITEMS, SHOP_A, SHOP_A_EXT, SHOP_B, SMITH, TREASURE_TABLE } from './data/index.js';
import { DIRS, GameMap, key } from './map.js';
import { MAPS } from './maps.js';
import { Rand, rng } from './rng.js';
import type {
  Ask, GameEvent, Input, ItemInst, ObjState, Option, PlayerState, PublicView, SeatInit, SelectKind, Settings, BattleState,
} from './types.js';

type Flow<T = void> = Generator<Ask, T, Input>;

export class Game {
  readonly rand: Rand;
  readonly map: GameMap;
  readonly players: PlayerState[];
  readonly objs: ObjState[];
  round = 1;
  turn = 0;
  battle: BattleState | null = null;
  winner = -1;
  over = false;
  counter = 0;
  events: GameEvent[] = [];

  constructor(readonly settings: Settings, seats: SeatInit[], readonly seed: number) {
    this.rand = new Rand(seed);
    this.map = new GameMap(MAPS[settings.map]);
    const s = this.map.start;
    const dir = this.map.startDir;
    this.players = seats.map((st, i) => {
      const c = CHARS[st.charId] ?? CHARS[0];
      return {
        seat: i, name: st.name, charId: c.id, isCpu: st.isCpu,
        hp: c.hp, maxHp: c.hp, mp: c.mp, maxMp: c.mp, luck: c.luck,
        gold: settings.startGold, items: c.items.map((id) => ({ id })),
        x: s.x, y: s.y, dir, steps: 0,
        respawn: { x: s.x, y: s.y, dir, steps: 0 },
        cursed: false, stun: 0,
      };
    });
    this.objs = this.map.data.objects.map((o) => ({ alive: o.type !== 'decor', hp: ENEMIES[o.type]?.hp ?? 0 }));
  }

  get ext(): boolean {
    return this.settings.rule === 'ext';
  }

  emit(e: GameEvent): void {
    this.events.push(e);
  }

  msg(text: string, seat?: number): void {
    this.emit({ t: 'msg', text, seat });
  }

  /** 歩数順位（1始まり、同数は同順位） */
  rankOf(p: PlayerState): number {
    return 1 + this.players.filter((q) => q.steps > p.steps).length;
  }

  view(): PublicView {
    const removed: number[] = [];
    const enemyHp: Record<number, number> = {};
    this.map.data.objects.forEach((o, i) => {
      const st = this.objs[i];
      if (!st.alive && o.type !== 'decor') removed.push(i);
      const e = ENEMIES[o.type];
      if (e && st.alive && st.hp < e.hp) enemyHp[i] = st.hp;
    });
    return {
      map: this.settings.map,
      round: this.round,
      turn: this.turn,
      // kiwami は絶対に含めない
      players: this.players.map((p) => ({
        ...p,
        respawn: { ...p.respawn },
        items: p.items.map((it) => it.id),
        rank: this.rankOf(p),
      })),
      removed,
      enemyHp,
      battle: this.battle ? { ...this.battle } : null,
      winner: this.winner,
      over: this.over,
    };
  }
}

// ───────── 基本ヘルパ ─────────

export function weaponAtk(p: PlayerState): number {
  return p.items.reduce((a, it) => Math.max(a, ITEMS[it.id].atk ?? 0), 0);
}
export function shieldDef(p: PlayerState): number {
  return p.items.reduce((a, it) => Math.max(a, ITEMS[it.id].kind === 'shield' ? (ITEMS[it.id].def ?? 0) : 0), 0);
}
export function has(p: PlayerState, id: number): boolean {
  return p.items.some((it) => it.id === id);
}
export function freeSlots(p: PlayerState): number {
  return C.SLOTS - p.items.length;
}
function removeSlot(g: Game, p: PlayerState, slot: number, silent = true): ItemInst {
  const [it] = p.items.splice(slot, 1);
  if (!silent) g.emit({ t: 'loseItem', seat: p.seat, item: it.id });
  return it;
}
/** 奪われる・失う対象になる枠（狂乱のサイコロ等は除く） */
function lossSlots(p: PlayerState): number[] {
  return p.items.flatMap((it, i) => (ITEMS[it.id].noLoss ? [] : [i]));
}
/** ランダムに1枠失う（候補が無ければ null） */
function loseRandom(g: Game, p: PlayerState, slots = lossSlots(p)): ItemInst | null {
  return slots.length ? removeSlot(g, p, slots[g.rand.int(slots.length)], false) : null;
}
function consume(p: PlayerState, id: number): boolean {
  const i = p.items.findIndex((it) => it.id === id);
  if (i < 0) return false;
  p.items.splice(i, 1);
  return true;
}
function sum(v: number[]): number {
  return v.reduce((a, b) => a + b, 0);
}
function roll(g: Game, p: PlayerState, n: number, purpose: string): number {
  const values = g.rand.dice(n);
  g.emit({ t: 'dice', seat: p.seat, values, purpose });
  return sum(values);
}
function addGold(g: Game, p: PlayerState, n: number): void {
  const before = p.gold;
  p.gold = Math.min(C.GOLD_MAX, p.gold + n);
  g.emit({ t: 'gold', seat: p.seat, amount: p.gold - before });
}
function heal(g: Game, p: PlayerState, n: number): void {
  const before = p.hp;
  p.hp = Math.min(p.maxHp, p.hp + n);
  g.emit({ t: 'heal', seat: p.seat, amount: p.hp - before });
}
/** りんごの回復量。秘伝の鍋があれば3ダイス＋2 */
function appleHeal(g: Game, p: PlayerState): number {
  return has(p, ITEM.secret_pot) ? roll(g, p, 3, 'heal') + 2 : roll(g, p, 2, 'heal');
}
function fullHeal(g: Game, p: PlayerState, mp = false): void {
  heal(g, p, p.maxHp);
  if (mp) p.mp = p.maxMp;
}

/** 入手可能か（ショップ・鍛冶屋の判定） */
export function canAcquire(p: PlayerState, id: number): boolean {
  const d = ITEMS[id];
  if (d.kind === 'magic') return p.maxMp > 0 && !has(p, id) && freeSlots(p) > 0;
  if (d.kind === 'weapon' || d.kind === 'shield') {
    const cur = p.items.find((it) => ITEMS[it.id].kind === d.kind);
    if (cur) return (d.atk ?? d.def ?? 0) > (ITEMS[cur.id].atk ?? ITEMS[cur.id].def ?? 0);
    return freeSlots(p) > 0;
  }
  if (d.kind === 'shoes') return freeSlots(p) > 0 || p.items.some((it) => ITEMS[it.id].kind === 'shoes');
  if (d.kind === 'passive') return !has(p, id) && freeSlots(p) > 0;
  return freeSlots(p) > 0;
}

/**
 * アイテム入手。武器・盾は上位の時だけ置き換え、靴は常に入れ替え。
 * inherit を渡した場合（奪取）は極状態を引き継ぐ。
 */
export function giveItem(g: Game, p: PlayerState, id: number, inherit?: ItemInst): boolean {
  const d = ITEMS[id];
  const inst: ItemInst = inherit ? { ...inherit } : { id };
  if (!inherit && id === ITEM.paru && g.ext && g.rand.chance(g.settings.kiwamiRate)) inst.kiwami = true;
  if (d.kind === 'weapon' || d.kind === 'shield' || d.kind === 'shoes') {
    const i = p.items.findIndex((it) => ITEMS[it.id].kind === d.kind);
    if (i >= 0) {
      const cur = ITEMS[p.items[i].id];
      const better = d.kind === 'shoes' || (d.atk ?? d.def ?? 0) > (cur.atk ?? cur.def ?? 0);
      if (!better) return false;
      g.emit({ t: 'loseItem', seat: p.seat, item: cur.no });
      p.items[i] = inst;
      g.emit({ t: 'getItem', seat: p.seat, item: id });
      return true;
    }
  }
  if ((d.kind === 'magic' || d.kind === 'passive') && has(p, id)) return false;
  if (freeSlots(p) <= 0) return false;
  p.items.push(inst);
  g.emit({ t: 'getItem', seat: p.seat, item: id });
  return true;
}

/** ダメージ処理。HP0ならエリクサー→復活地点の順 */
export function hurt(g: Game, p: PlayerState, n: number): 'alive' | 'revived' | 'dead' {
  p.hp = Math.max(0, p.hp - n);
  g.emit({ t: 'damage', seat: p.seat, amount: n });
  if (p.hp > 0) return 'alive';
  if (consume(p, ITEM.elixir)) {
    g.emit({ t: 'loseItem', seat: p.seat, item: ITEM.elixir });
    p.hp = p.maxHp;
    g.emit({ t: 'revive', seat: p.seat });
    g.msg(`${p.name}はエリクサーで復活した！`, p.seat);
    return 'revived';
  }
  g.emit({ t: 'death', seat: p.seat });
  g.msg(`${p.name}は倒れた…`, p.seat);
  respawn(g, p);
  return 'dead';
}

function respawn(g: Game, p: PlayerState): void {
  p.x = p.respawn.x;
  p.y = p.respawn.y;
  p.dir = p.respawn.dir;
  p.steps = p.respawn.steps;
  p.hp = p.maxHp;
  p.mp = p.maxMp;
  g.emit({ t: 'respawn', seat: p.seat });
}

function setRespawn(g: Game, p: PlayerState): void {
  p.respawn = { x: p.x, y: p.y, dir: p.dir, steps: p.steps };
  g.emit({ t: 'fx', name: 'warp', seat: p.seat });
}

/** 身代わり人形による無効化 */
function blockedByDoll(g: Game, q: PlayerState): boolean {
  if (!consume(q, ITEM.dummy_doll)) return false;
  g.emit({ t: 'loseItem', seat: q.seat, item: ITEM.dummy_doll });
  g.msg(`${q.name}の身代わり人形が身代わりになった！`, q.seat);
  return true;
}

/** 使用者の次のプレイヤーから順に（使用者は最後） */
function orderFrom(g: Game, p: PlayerState): PlayerState[] {
  const n = g.players.length;
  return Array.from({ length: n }, (_, i) => g.players[(p.seat + 1 + i) % n]);
}

function byRank(g: Game): PlayerState[] {
  return [...g.players].sort((a, b) => b.steps - a.steps || a.seat - b.seat);
}

function swapPos(g: Game, a: PlayerState, b: PlayerState): void {
  const pa = { x: a.x, y: a.y, dir: a.dir, steps: a.steps };
  a.x = b.x; a.y = b.y; a.dir = b.dir; a.steps = b.steps;
  b.x = pa.x; b.y = pa.y; b.dir = pa.dir; b.steps = pa.steps;
  g.emit({ t: 'swap', a: a.seat, b: b.seat });
}

export function usableSlots(p: PlayerState, where: 'field' | 'battle'): number[] {
  const out: number[] = [];
  p.items.forEach((it, i) => {
    const d = ITEMS[it.id];
    if (where === 'field' ? !d.field : !d.battle) return;
    if (d.kind === 'magic' && p.mp < (d.mp ?? 0)) return;
    out.push(i);
  });
  return out;
}

function* select(g: Game, p: PlayerState, sub: SelectKind, title: string, options: Option[], def: number): Flow<number> {
  const inp = yield { kind: 'select', seat: p.seat, sub, title, options, def };
  return inp.type === 'select' ? inp.index : def;
}

// ───────── 進行 ─────────

export function* play(g: Game): Flow {
  g.msg('ゲーム開始！');
  while (!g.over) {
    yield* takeTurn(g, g.players[g.turn]);
    if (g.over) break;
    g.turn = (g.turn + 1) % g.players.length;
    if (g.turn === 0) {
      g.round++;
      const lim = g.settings.turnLimit;
      if (lim && g.round > lim) {
        finishByLimit(g);
        break;
      }
    }
  }
}

function finishByLimit(g: Game): void {
  const key = g.settings.limitWinner;
  const best = [...g.players].sort((a, b) => (key === 'gold' ? b.gold - a.gold : b.steps - a.steps) || a.seat - b.seat)[0];
  g.winner = best.seat;
  g.over = true;
  g.round = g.settings.turnLimit;
  g.emit({ t: 'gameOver', winner: best.seat, reason: key === 'gold' ? 'ターン上限（所持金最多）' : 'ターン上限（歩数最多）' });
}

function* takeTurn(g: Game, p: PlayerState): Flow {
  g.emit({ t: 'turn', seat: p.seat, round: g.round });
  if (p.stun > 0) {
    p.stun--;
    g.emit({ t: 'skip', seat: p.seat, reason: 'piyo' });
    g.msg(`${p.name}はピヨっていて動けない！`, p.seat);
    return;
  }
  const inp = yield { kind: 'action', seat: p.seat, items: usableSlots(p, 'field') };
  if (inp.type === 'roll') {
    yield* move(g, p, has(p, ITEM.run_shoes) ? 2 : 1, false);
  } else if (inp.type === 'useItem') {
    yield* useFieldItem(g, p, inp.slot);
  } else {
    g.msg(`${p.name}は行動しなかった`, p.seat);
  }
}

function* move(g: Game, p: PlayerState, nDice: number, ichi: boolean, bonus = 0): Flow {
  let steps: number;
  if (ichi) {
    g.emit({ t: 'dice', seat: p.seat, values: [1], ichi: true, purpose: 'move' });
    steps = 1;
  } else {
    steps = roll(g, p, nDice, 'move') + bonus;
  }
  let cells: { x: number; y: number }[] = [];
  const flush = () => {
    if (cells.length) g.emit({ t: 'move', seat: p.seat, cells });
    cells = [];
  };
  for (let i = 0; i < steps; i++) {
    let d = g.map.nextDir(p.x, p.y, p.dir);
    if (d === null) {
      flush();
      const opts = g.map.branchOptions(p.x, p.y, p.dir);
      const sel = yield* select(g, p, 'branch', '分かれ道だ！ どちらへ進む？',
        opts.map((o) => ({ label: o.easy ? '楽な道' : '険しい道' })), 0);
      d = opts[Math.min(sel, opts.length - 1)].dir;
    }
    const nx = p.x + DIRS[d][0];
    const ny = p.y + DIRS[d][1];
    if (!g.map.cell(nx, ny)) break;
    p.x = nx;
    p.y = ny;
    p.dir = d;
    p.steps++;
    cells.push({ x: nx, y: ny });
    if (g.map.isBossCell(nx, ny)) {
      const bi = g.map.bossOf.get(key(nx, ny));
      if (bi !== undefined && g.objs[bi].alive) {
        flush();
        yield* battle(g, p, bi);
        return;
      }
    }
  }
  flush();
  yield* stopEvents(g, p);
}

// ───────── マス目イベント ─────────

function* stopEvents(g: Game, p: PlayerState): Flow {
  const list = g.map.triggers.get(key(p.x, p.y)) ?? [];
  for (const idx of list) {
    if (!g.objs[idx].alive || g.over) continue;
    const x = p.x;
    const y = p.y;
    yield* objectEvent(g, p, idx);
    if (p.x !== x || p.y !== y) break; // 死亡・ワープ等で移動したら終了
  }
}

function removeObj(g: Game, idx: number): void {
  g.objs[idx].alive = false;
  g.emit({ t: 'objRemove', idx });
}

function* objectEvent(g: Game, p: PlayerState, idx: number): Flow {
  const o = g.map.data.objects[idx];
  if (ENEMIES[o.type]) {
    yield* battle(g, p, idx);
    return;
  }
  switch (o.type) {
    case 'priest':
      setRespawn(g, p);
      g.msg('神父「ここを復活地点として記録しました」', p.seat);
      return;
    case 'inn':
      yield* inn(g, p);
      return;
    case 'shop':
      yield* shop(g, p, o.x, o.y);
      return;
    case 'shoes':
      yield* shoes(g, p);
      return;
    case 'treasure':
      yield* treasure(g, p, idx);
      return;
    case 'qbox':
      yield* qbox(g, p);
      return;
    case 'smith':
      yield* smith(g, p);
      return;
    case 'casino':
      yield* casino(g, p);
      return;
    case 'tack':
    case 'tack_big': {
      removeObj(g, idx);
      if (has(p, ITEM.safe_shoes)) {
        g.msg('安全靴ががびょうを防いだ！', p.seat);
        return;
      }
      g.emit({ t: 'fx', name: 'hit', seat: p.seat });
      const n = roll(g, p, o.type === 'tack' ? 1 : 2, 'damage');
      g.msg(`がびょうを踏んだ！ ${n}ダメージ`, p.seat);
      hurt(g, p, n);
      return;
    }
    case 'gold_small':
    case 'gold_large': {
      removeObj(g, idx);
      const n = roll(g, p, o.type === 'gold_small' ? 1 : 3, 'gold');
      g.emit({ t: 'fx', name: 'gold', seat: p.seat });
      g.msg(`${n}Gを拾った！`, p.seat);
      addGold(g, p, n);
      return;
    }
  }
}

function* inn(g: Game, p: PlayerState): Flow {
  const sel = yield* select(g, p, 'inn', `宿屋「一晩${C.INN_PRICE}Gだよ。泊まっていくかい？」`,
    [{ label: `泊まる（${C.INN_PRICE}G）`, disabled: p.gold < C.INN_PRICE }, { label: '泊まらない' }], 1);
  if (sel !== 0 || p.gold < C.INN_PRICE) return;
  p.gold -= C.INN_PRICE;
  g.emit({ t: 'gold', seat: p.seat, amount: -C.INN_PRICE });
  g.emit({ t: 'fx', name: 'heal', seat: p.seat });
  fullHeal(g, p, true);
  g.msg('HPとMPが全回復した！', p.seat);
}

export function shopStock(g: Game, x: number, y: number): number[] {
  const a = rng(g.seed, x, y, 0) % 2 === 0;
  return a ? (g.ext ? SHOP_A_EXT : SHOP_A) : SHOP_B;
}

function* shop(g: Game, p: PlayerState, x: number, y: number): Flow {
  const stock = shopStock(g, x, y);
  const opts: Option[] = stock.map((id) => {
    const d = ITEMS[id];
    return { label: `${d.name}　${d.price}G`, value: id, disabled: p.gold < (d.price ?? 0) || !canAcquire(p, id) };
  });
  opts.push({ label: '買わない' });
  const sel = yield* select(g, p, 'shop', '商人「いらっしゃい！ どれにする？」', opts, stock.length);
  if (sel >= stock.length || opts[sel].disabled) return;
  const id = stock[sel];
  p.gold -= ITEMS[id].price ?? 0;
  g.emit({ t: 'gold', seat: p.seat, amount: -(ITEMS[id].price ?? 0) });
  giveItem(g, p, id);
}

function* smith(g: Game, p: PlayerState): Flow {
  const opts: Option[] = SMITH.map((s) => ({
    label: `${ITEMS[s.item].name}　${s.price}G`, value: s.item, disabled: p.gold < s.price || !canAcquire(p, s.item),
  }));
  opts.push({ label: 'やめる' });
  const sel = yield* select(g, p, 'smith', '鍛冶屋「伝説の武具、打ってやろうか？」', opts, SMITH.length);
  if (sel >= SMITH.length || opts[sel].disabled) return;
  p.gold -= SMITH[sel].price;
  g.emit({ t: 'gold', seat: p.seat, amount: -SMITH[sel].price });
  giveItem(g, p, SMITH[sel].item);
}

function* casino(g: Game, p: PlayerState): Flow {
  const bets = [10, 30, 50];
  const sel = yield* select(g, p, 'casino_bet', '賭場「丁か半か、張っていきな」',
    [...bets.map((b) => ({ label: `${b}G 賭ける`, value: b, disabled: p.gold < b })), { label: 'やめる' }], bets.length);
  if (sel >= bets.length || p.gold < bets[sel]) return;
  const bet = bets[sel];
  const pick = yield* select(g, p, 'casino_pick', '丁（偶数）か半（奇数）か？', [{ label: '丁（偶数）' }, { label: '半（奇数）' }], 0);
  const n = roll(g, p, 2, 'casino');
  const even = n % 2 === 0;
  if ((pick === 0) === even) {
    g.msg(`${n}の${even ? '丁' : '半'}！ 当たり！`, p.seat);
    addGold(g, p, bet);
    g.emit({ t: 'fx', name: 'gold', seat: p.seat });
  } else {
    g.msg(`${n}の${even ? '丁' : '半'}… はずれ`, p.seat);
    p.gold -= bet;
    g.emit({ t: 'gold', seat: p.seat, amount: -bet });
  }
}

function* shoes(g: Game, p: PlayerState): Flow {
  if (freeSlots(p) <= 0 && !p.items.some((it) => ITEMS[it.id].kind === 'shoes')) {
    g.msg('靴仙人「荷物がいっぱいのようじゃな」', p.seat);
    return;
  }
  const sel = yield* select(g, p, 'shoes', '靴仙人「好きな靴をひとつ授けよう」',
    [{ label: '運動靴', value: ITEM.run_shoes }, { label: '安全靴', value: ITEM.safe_shoes }, { label: 'いらない' }], 2);
  if (sel === 0) giveItem(g, p, ITEM.run_shoes);
  else if (sel === 1) giveItem(g, p, ITEM.safe_shoes);
}

function* qbox(g: Game, p: PlayerState): Flow {
  const ids: number[] = [ITEM.piyo, ITEM.absorb, ITEM.curse];
  if (g.ext) ids.push(ITEM.dummy_doll);
  const full = freeSlots(p) <= 0;
  const opts: Option[] = ids.map((id) => ({ label: ITEMS[id].name, value: id, disabled: full }));
  opts.push({ label: 'キャンセル' });
  const sel = yield* select(g, p, 'qbox', '?ボックスだ！ ひとつ選べる', opts, ids.length);
  if (sel < ids.length && !full) giveItem(g, p, ids[sel]);
}

function explode(g: Game, p: PlayerState, idx: number): void {
  removeObj(g, idx);
  g.emit({ t: 'fx', name: 'explosion', seat: p.seat });
  const n = roll(g, p, 2, 'damage');
  g.msg(`宝箱が爆発した！ ${n}ダメージ`, p.seat);
  hurt(g, p, n);
}

function* treasure(g: Game, p: PlayerState, idx: number): Flow {
  const sel = yield* select(g, p, 'treasure', '宝箱がある。開けますか？', [{ label: '開ける' }, { label: '開けない' }], 1);
  if (sel !== 0) return;
  const o = g.map.data.objects[idx];
  if (p.cursed) {
    p.cursed = false;
    g.msg('呪いのせいで宝箱が爆発した！（呪いが解けた）', p.seat);
    explode(g, p, idx);
    return;
  }
  const cap = g.ext && g.settings.map === 2 ? 17 : 15;
  const t = Math.min(cap, (rng(g.seed, o.x, o.y, ++g.counter) % 10) + p.luck);
  const id = TREASURE_TABLE[t];
  if (id === 0) {
    explode(g, p, idx);
    return;
  }
  g.emit({ t: 'chestOpen', idx });
  if (giveItem(g, p, id)) {
    g.msg(`${ITEMS[id].name}を手に入れた！`, p.seat);
    removeObj(g, idx);
  } else {
    g.msg(`${ITEMS[id].name}が入っていたが、持ちきれない…`, p.seat);
  }
}

// ───────── 戦闘 ─────────

function* battle(g: Game, p: PlayerState, idx: number): Flow {
  const o = g.map.data.objects[idx];
  const st = g.objs[idx];
  const e = ENEMIES[o.type];
  g.battle = { seat: p.seat, obj: idx, enemy: o.type, hp: st.hp, maxHp: e.hp, phase2: !!st.phase2 };
  g.emit({ t: 'battleStart', seat: p.seat, obj: idx, enemy: o.type });
  g.msg(`${e.name}が現れた！`, p.seat);
  const end = (result: 'win' | 'lose' | 'leave') => {
    g.emit({ t: 'battleEnd', seat: p.seat, result });
    g.battle = null;
  };
  if (has(p, ITEM.hunter_bow)) {
    // 早撃ちの弓：手番の前に先制で1ダイス（武器・防御は無関係）
    g.msg(`${p.name}は早撃ちの弓を放った！`, p.seat);
    const dmg = roll(g, p, 1, 'attack');
    st.hp = Math.max(0, st.hp - dmg);
    g.battle.hp = st.hp;
    g.emit({ t: 'battleHit', seat: p.seat, target: 'enemy', amount: dmg, fx: 'hit' });
    if (st.hp <= 0) {
      end('win');
      yield* victory(g, p, idx);
      return;
    }
  }
  for (;;) {
    const inp = yield { kind: 'battle', seat: p.seat, items: usableSlots(p, 'battle') };
    let dmg = -1;
    let fx = 'hit';
    if (inp.type === 'battleAttack') {
      dmg = Math.max(0, roll(g, p, 1 + (has(p, ITEM.sword_orb) ? 1 : 0), 'attack') + weaponAtk(p) - e.def);
    } else if (inp.type === 'useItem') {
      const it = p.items[inp.slot];
      const d = ITEMS[it.id];
      g.msg(`${p.name}は${d.name}を使った！`, p.seat);
      g.emit({ t: 'itemUse', seat: p.seat, item: it.id });
      if (d.kind === 'magic') p.mp -= d.mp ?? 0;
      else if (!d.keep) removeSlot(g, p, inp.slot, false);
      switch (it.id) {
        case ITEM.apple:
          g.emit({ t: 'fx', name: 'heal', seat: p.seat });
          heal(g, p, appleHeal(g, p));
          break;
        case ITEM.mag_heal:
          g.emit({ t: 'fx', name: 'heal', seat: p.seat });
          heal(g, p, roll(g, p, 3, 'heal'));
          p.cursed = false;
          break;
        case ITEM.dice:
          dmg = Math.max(0, roll(g, p, 2 + (has(p, ITEM.sword_orb) ? 1 : 0), 'attack') + weaponAtk(p) - e.def);
          break;
        case ITEM.ichi:
          g.emit({ t: 'dice', seat: p.seat, values: [1], ichi: true, purpose: 'attack' });
          dmg = 1;
          break;
        case ITEM.chaos_dice: {
          const v = chaosDie(g, p, true);
          if (v < 0) {
            end('lose');
            return;
          }
          if (st.hp > 0) dmg = Math.max(0, roll(g, p, 1 + (has(p, ITEM.sword_orb) ? 1 : 0), 'attack') + v + weaponAtk(p) - e.def);
          break;
        }
        case ITEM.mag_fire:
          fx = 'fire';
          dmg = roll(g, p, 2, 'attack');
          break;
        case ITEM.mag_summon:
          fx = 'summon';
          dmg = roll(g, p, 3, 'attack');
          break;
      }
    } else {
      g.msg(`${p.name}は戦闘をやめた`, p.seat);
      end('leave');
      return;
    }
    if (dmg >= 0) {
      st.hp = Math.max(0, st.hp - dmg);
      g.battle!.hp = st.hp;
      g.emit({ t: 'battleHit', seat: p.seat, target: 'enemy', amount: dmg, fx });
    }
    if (st.hp <= 0) {
      end('win');
      yield* victory(g, p, idx);
      return;
    }
    let actions = 1;
    if (o.type === 'lastboss_king' && !st.phase2 && st.hp <= e.hp / 2) {
      st.phase2 = true;
      g.battle!.phase2 = true;
      actions = 2;
      g.emit({ t: 'phase2', seat: p.seat });
      g.msg('魔王の姿が変わった！ 第2形態だ！', p.seat);
    }
    const atkDice = st.phase2 ? 3 : e.atkDice;
    for (let a = 0; a < actions; a++) {
      const n = Math.max(0, roll(g, p, atkDice, 'enemy') + e.str - shieldDef(p));
      g.emit({ t: 'battleHit', seat: p.seat, target: 'player', amount: n, fx: 'hit' });
      if (hurt(g, p, n) === 'dead') {
        end('lose');
        return;
      }
    }
  }
}

function* victory(g: Game, p: PlayerState, idx: number): Flow {
  const o = g.map.data.objects[idx];
  const e = ENEMIES[o.type];
  g.emit({ t: 'fx', name: 'explosion', x: o.x, y: o.y });
  removeObj(g, idx);
  g.msg(`${e.name}を倒した！`, p.seat);
  if (e.boss === 'last') {
    g.winner = p.seat;
    g.over = true;
    g.emit({ t: 'gameOver', winner: p.seat, reason: 'ラスボス撃破' });
    return;
  }
  if (e.goldDice > 0) {
    const n = roll(g, p, e.goldDice, 'gold');
    g.emit({ t: 'fx', name: 'gold', seat: p.seat });
    addGold(g, p, n);
  }
  if (e.drop !== null) {
    if (giveItem(g, p, e.drop)) g.msg(`${ITEMS[e.drop].name}を手に入れた！`, p.seat);
    else g.msg(`${ITEMS[e.drop].name}を落としたが、持てなかった…`, p.seat);
  }
}

// ───────── フィールドアイテム ─────────

function* useFieldItem(g: Game, p: PlayerState, slot: number): Flow {
  const it = p.items[slot];
  const d = ITEMS[it.id];
  g.msg(`${p.name}は${d.name}を使った！`, p.seat);
  g.emit({ t: 'itemUse', seat: p.seat, item: it.id });
  if (d.kind === 'magic') p.mp -= d.mp ?? 0;
  else if (!d.keep) removeSlot(g, p, slot, false);
  if (MEDDLE.includes(it.id) && g.players.length > 1) g.emit({ t: 'meddle', seat: p.seat });
  switch (it.id) {
    case ITEM.apple:
      g.emit({ t: 'fx', name: 'heal', seat: p.seat });
      heal(g, p, appleHeal(g, p));
      return;
    case ITEM.amulet:
      setRespawn(g, p);
      g.msg('ここを復活地点として記録した', p.seat);
      return;
    case ITEM.dice:
      yield* move(g, p, (has(p, ITEM.run_shoes) ? 2 : 1) + 1, false);
      return;
    case ITEM.ichi:
      yield* move(g, p, 1, true);
      return;
    case ITEM.mag_heal:
      g.emit({ t: 'fx', name: 'heal', seat: p.seat });
      heal(g, p, roll(g, p, 3, 'heal'));
      if (p.cursed) g.msg('呪いが解けた！', p.seat);
      p.cursed = false;
      return;
    case ITEM.mag_luck: {
      const v = roll(g, p, 3, 'luck');
      const r = g.rand.int(3);
      if (r === 0) {
        g.msg(`${v}Gを手に入れた！`, p.seat);
        g.emit({ t: 'fx', name: 'gold', seat: p.seat });
        addGold(g, p, v);
      } else if (r === 1) {
        g.emit({ t: 'fx', name: 'heal', seat: p.seat });
        heal(g, p, v);
      } else {
        p.luck++;
        g.msg('運が1上がった！', p.seat);
      }
      return;
    }
    case ITEM.paru:
      if (it.kiwami) paruKiwami(g, p);
      else paru(g, p);
      return;
    case ITEM.piyo: {
      const others = g.players.filter((q) => q !== p);
      if (!others.length) return;
      const top = byRank(g).filter((q) => q !== p)[0];
      if (blockedByDoll(g, top)) return;
      top.stun = 2;
      g.emit({ t: 'stun', seat: top.seat, turns: 2 });
      g.msg(`${top.name}はピヨった！ 2ターン動けない`, top.seat);
      return;
    }
    case ITEM.absorb: {
      const cand = g.players.filter((q) => q !== p && lossSlots(q).length > 0);
      if (!cand.length) {
        g.msg('しかし何も起こらなかった', p.seat);
        return;
      }
      const q = g.rand.pick(cand);
      g.emit({ t: 'fx', name: 'absorb', seat: q.seat });
      if (blockedByDoll(g, q)) return;
      const stolen = loseRandom(g, q)!;
      g.msg(`${q.name}から${ITEMS[stolen.id].name}を奪った！`, p.seat);
      if (!giveItem(g, p, stolen.id, stolen)) g.msg('…が持ちきれず捨てた', p.seat);
      return;
    }
    case ITEM.curse:
      for (const q of orderFrom(g, p)) {
        if (q === p || blockedByDoll(g, q)) continue;
        q.cursed = true;
        g.emit({ t: 'curse', seat: q.seat });
      }
      g.msg('自分以外の全員が呪われた！', p.seat);
      return;
    case ITEM.joker:
      joker(g, p);
      return;
    case ITEM.chaos_dice: {
      const v = chaosDie(g, p, false);
      if (v > 0) yield* move(g, p, has(p, ITEM.run_shoes) ? 2 : 1, false, v);
      return;
    }
    case ITEM.warp_scroll:
      p.x = p.respawn.x;
      p.y = p.respawn.y;
      p.dir = p.respawn.dir;
      p.steps = p.respawn.steps;
      g.emit({ t: 'warp', seat: p.seat });
      g.msg('復活地点へワープした！', p.seat);
      return;
  }
}

/** 他のプレイヤーに向けて使うアイテム（いじわるマスター用） */
const MEDDLE: number[] = [ITEM.piyo, ITEM.absorb, ITEM.curse, ITEM.paru];

/** ジョーカーの札：3パターンのどれか */
function joker(g: Game, p: PlayerState): void {
  const r = g.rand.int(3);
  if (r === 0) {
    g.msg(`ババを引いた！ ${p.name}に3ダメージ`, p.seat);
    hurt(g, p, 3);
  } else if (r === 1) {
    const q = g.rand.pick(g.players);
    g.msg(`${q.name}に2ダメージ！`, p.seat);
    if (q !== p) {
      g.emit({ t: 'meddle', seat: p.seat });
      if (blockedByDoll(g, q)) return;
    }
    hurt(g, q, 2);
  } else {
    g.msg('ジョーカーが笑った！ MPが2回復し、他の全員に5ダメージ！', p.seat);
    p.mp = Math.min(p.maxMp, p.mp + 2);
    const others = orderFrom(g, p).filter((q) => q !== p);
    if (others.length) g.emit({ t: 'meddle', seat: p.seat });
    for (const q of others) if (!blockedByDoll(g, q)) hurt(g, q, 5);
  }
}

/**
 * 狂乱のサイコロ：出目の特殊効果を処理し、移動・攻撃に加える値を返す（6は9）。
 * 戦闘中に自分が倒れたら -1、通常時に倒れたら 0（移動しない）。
 */
function chaosDie(g: Game, p: PlayerState, inBattle: boolean): number {
  const face = g.rand.die();
  g.emit({ t: 'dice', seat: p.seat, values: [face], purpose: 'chaos' });
  const value = face === 6 ? 9 : face;
  let fate: 'alive' | 'revived' | 'dead' = 'alive';
  switch (face) {
    case 1:
      g.msg('狂乱の1！ 自分に1ダメージ', p.seat);
      fate = hurt(g, p, 1);
      break;
    case 2: {
      g.msg('狂乱の2！ アイテムをひとつ失った', p.seat);
      loseRandom(g, p, lossSlots(p).filter((i) => !ITEMS[p.items[i].id].unique));
      break;
    }
    case 3:
      g.msg('狂乱の3！ りんごを手に入れた', p.seat);
      if (!giveItem(g, p, ITEM.apple)) g.msg('…が持ちきれない', p.seat);
      break;
    case 4:
      if (inBattle) {
        const b = g.battle!;
        if (g.rand.int(2) === 0) {
          g.msg('狂乱の4！ 敵に99ダメージ！', p.seat);
          const st = g.objs[b.obj];
          st.hp = Math.max(0, st.hp - 99);
          b.hp = st.hp;
          g.emit({ t: 'battleHit', seat: p.seat, target: 'enemy', amount: 99, fx: 'hit' });
        } else {
          g.msg(`狂乱の4！ ${p.name}に99ダメージ！`, p.seat);
          g.emit({ t: 'battleHit', seat: p.seat, target: 'player', amount: 99, fx: 'hit' });
          fate = hurt(g, p, 99);
        }
      } else {
        const q = g.rand.pick(g.players);
        g.msg(`狂乱の4！ ${q.name}に99ダメージ！`, p.seat);
        if (q !== p) {
          g.emit({ t: 'meddle', seat: p.seat });
          if (!blockedByDoll(g, q)) hurt(g, q, 99);
        } else fate = hurt(g, p, 99);
      }
      break;
    case 5:
      g.msg('狂乱の5！ HPが2回復', p.seat);
      g.emit({ t: 'fx', name: 'heal', seat: p.seat });
      heal(g, p, 2);
      break;
    case 6:
      g.msg('狂乱の6！ 出目は9になる！', p.seat);
      break;
  }
  if (fate === 'dead') return inBattle ? -1 : 0;
  return value;
}

function paru(g: Game, p: PlayerState): void {
  const face = g.rand.die();
  g.emit({ t: 'paru', seat: p.seat, kiwami: false, face });
  g.emit({ t: 'dice', seat: p.seat, values: [face], purpose: 'paru' });
  const all = orderFrom(g, p);
  switch (face) {
    case 1:
      g.msg('全員に99ダメージ！');
      for (const q of all) hurt(g, q, 99);
      return;
    case 2:
      g.msg('何も起こらなかった…');
      return;
    case 3:
      g.msg('全員のHPが全回復した！');
      for (const q of all) fullHeal(g, q);
      return;
    case 4:
      g.msg('全員アイテムをひとつ失った！');
      for (const q of all) loseRandom(g, q);
      return;
    case 5:
      g.msg('今年はりんごが豊作だ！');
      for (const q of all) while (freeSlots(q) > 0) giveItem(g, q, ITEM.apple);
      return;
    case 6: {
      g.msg('順位が入れ替わった！');
      const r = byRank(g);
      const n = r.length;
      if (n === 4) {
        swapPos(g, r[0], r[3]);
        swapPos(g, r[1], r[2]);
      } else if (n === 3) swapPos(g, r[0], r[2]);
      else if (n === 2) swapPos(g, r[0], r[1]);
      return;
    }
  }
}

function paruKiwami(g: Game, p: PlayerState): void {
  const face = g.rand.die();
  g.emit({ t: 'paru', seat: p.seat, kiwami: true, face });
  g.msg('……ぱるぷん玉<極>だった！', p.seat);
  g.emit({ t: 'dice', seat: p.seat, values: [face], purpose: 'paru' });
  const others = orderFrom(g, p).filter((q) => q !== p);
  switch (face) {
    case 1:
      g.msg('天罰！ 使用者以外の全員に99ダメージ！');
      for (const q of others) if (!blockedByDoll(g, q)) hurt(g, q, 99);
      return;
    case 2:
      g.msg('神の祝福！ 最大HP・最大MPが5上がった！', p.seat);
      p.maxHp += 5;
      p.maxMp += 5;
      p.cursed = false;
      g.emit({ t: 'fx', name: 'heal', seat: p.seat });
      fullHeal(g, p, true);
      return;
    case 3:
      g.msg('黄金の雨！ 全員の所持金の半分を奪った！', p.seat);
      for (const q of others) {
        const n = Math.floor(q.gold / 2);
        q.gold -= n;
        g.emit({ t: 'gold', seat: q.seat, amount: -n });
        addGold(g, p, n);
      }
      return;
    case 4: {
      g.msg('大強奪！', p.seat);
      const plan = others.map((q) => ({ q, k: Math.ceil(lossSlots(q).length / 2) }));
      for (const { q, k } of plan) {
        g.emit({ t: 'fx', name: 'absorb', seat: q.seat });
        for (let i = 0; i < k; i++) {
          const it = loseRandom(g, q);
          if (!it) break;
          if (freeSlots(p) > 0) giveItem(g, p, it.id, it); // 入りきらない分は破棄
        }
      }
      g.msg('代償として99ダメージ！', p.seat);
      hurt(g, p, 99);
      return;
    }
    case 5: {
      g.msg('大豊作・極！', p.seat);
      let guard = 0;
      while (freeSlots(p) > 0 && guard++ < 50) giveItem(g, p, TREASURE_TABLE[10 + g.rand.int(6)]);
      return;
    }
    case 6: {
      g.msg('時空逆転！', p.seat);
      const top = byRank(g)[0];
      if (top.steps > p.steps) {
        swapPos(g, p, top);
        return;
      }
      loseRandom(g, p);
      giveItem(g, p, ITEM.paru);
      giveItem(g, p, ITEM.paru);
      return;
    }
  }
}

// ───────── ドライバ ─────────

export function defaultInput(ask: Ask): Input {
  if (ask.kind === 'select') return { type: 'select', index: ask.def };
  return { type: 'timeout' };
}

export function isValidInput(ask: Ask, inp: Input): boolean {
  switch (inp.type) {
    case 'timeout':
      return true;
    case 'roll':
      return ask.kind === 'action';
    case 'battleAttack':
      return ask.kind === 'battle';
    case 'useItem':
      return (ask.kind === 'action' || ask.kind === 'battle') && ask.items.includes(inp.slot);
    case 'select':
      return ask.kind === 'select' && Number.isInteger(inp.index) && inp.index >= 0 &&
        inp.index < ask.options.length && !ask.options[inp.index].disabled;
  }
  return false;
}

/** ゲームを進行させる。サーバ・ローカル対戦・リプレイ共通 */
export class Runner {
  readonly game: Game;
  readonly log: Input[] = [];
  ask: Ask | null = null;
  private gen: Flow;

  constructor(settings: Settings, seats: SeatInit[], seed: number) {
    this.game = new Game(settings, seats, seed);
    this.gen = play(this.game);
    this.step(undefined as unknown as Input);
  }

  private step(inp: Input): void {
    const r = this.gen.next(inp);
    this.ask = r.done ? null : r.value;
  }

  /** 入力を検証して適用。不正な入力は false */
  submit(inp: Input): boolean {
    if (!this.ask || !isValidInput(this.ask, inp)) return false;
    const real = inp.type === 'timeout' && this.ask.kind === 'select' ? defaultInput(this.ask) : inp;
    this.log.push(real);
    this.step(real);
    return true;
  }

  drain(): GameEvent[] {
    const e = this.game.events;
    this.game.events = [];
    return e;
  }

  static replay(settings: Settings, seats: SeatInit[], seed: number, log: Input[]): Runner {
    const r = new Runner(settings, seats, seed);
    for (const i of log) r.submit(i);
    return r;
  }
}
