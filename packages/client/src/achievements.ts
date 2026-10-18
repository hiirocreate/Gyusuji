import { BASE_CHAR_COUNT, CHARS, ENEMIES, ITEM } from '@gyusuji/shared';
import type { GameEvent, PublicView } from '@gyusuji/shared';
import { store, update } from './store.js';
import { system } from './chat.js';

/** hidden は解除されるまで一覧に出さない */
export const ACHIEVEMENTS: { id: string; name: string; desc: string; hidden?: boolean }[] = [
  { id: 'first_win', name: '初優勝', desc: 'はじめて優勝する' },
  { id: 'lastboss', name: 'ハンター', desc: 'ラスボスを倒す' },
  { id: 'kiwami', name: '極めし者', desc: 'ぱるぷん玉<極>を引く' },
  { id: 'games10', name: '常連', desc: '10回対戦する' },
  { id: 'wins5', name: '王者', desc: '5回優勝する' },
  { id: 'rich', name: '大富豪', desc: '所持金500G以上になる' },
  { id: 'full_inv', name: 'コレクター', desc: '所持品を10枠埋める' },
  { id: 'midboss', name: '番人狩り', desc: '中ボスを倒す' },
  { id: 'elixir', name: '不死身', desc: 'エリクサーで復活する' },
  { id: 'hero_set', name: '伝説の装備', desc: '勇者の剣と勇者の盾を同時に持つ' },
  { id: 'true_hero', name: '真の勇者', desc: 'ラスボスを10回倒す' },
  { id: 'all5', name: '五傑制覇', desc: '5人のキャラクターすべてで優勝する（狩人・料理人が解放）' },
  { id: 'all7', name: '全キャラ制覇', desc: '狩人・料理人を含む7人すべてで優勝する' },
  { id: 'meanie', name: 'いじわるマスター', desc: '他のキャラにアイテムを30回使う（ヒーロが解放）', hidden: true },
  { id: 'nero', name: '不屈の覇者', desc: '一度も倒れずにラスボスを倒して優勝する（ネロが解放）', hidden: true },
];

/** 隠し実績で解放されるキャラは、解放されるまで一覧にも出さない */
export const SECRET_UNLOCKS: string[] = ACHIEVEMENTS.filter((a) => a.hidden).map((a) => a.id);

export function unlock(id: string): void {
  if (store().achievements[id]) return;
  update((s) => (s.achievements[id] = Date.now()));
  const a = ACHIEVEMENTS.find((x) => x.id === id);
  if (a) system(`実績解除：${a.name}`);
}

/** 自分の席に関するイベントを見て実績を更新 */
export class Tracker {
  private battleEnemy = '';
  private view: PublicView | null = null;
  /** このゲームで倒れた（エリクサー復活を含む）席 */
  private fallen = new Set<number>();
  private lastBossBy = -1;
  constructor(private mine: Set<number>) {}
  feed(events: GameEvent[], view: PublicView): void {
    this.view = view;
    for (const e of events) {
      const me = 'seat' in e && this.mine.has(e.seat as number);
      if (e.t === 'paru' && me && e.kiwami) unlock('kiwami');
      if (e.t === 'revive' && me) unlock('elixir');
      if ((e.t === 'revive' || e.t === 'death') && me) this.fallen.add(e.seat);
      if (e.t === 'battleStart' && me) this.battleEnemy = e.enemy;
      if (e.t === 'battleEnd' && me && e.result === 'win') {
        const b = ENEMIES[this.battleEnemy]?.boss;
        if (b === 'mid') unlock('midboss');
        if (b === 'last') {
          this.lastBossBy = e.seat;
          unlock('lastboss');
          update((s) => s.stats.lastBossKills++);
          if (store().stats.lastBossKills >= 10) unlock('true_hero');
        }
      }
      if (e.t === 'meddle' && me) {
        update((s) => s.stats.meddles++);
        if (store().stats.meddles >= 30) unlock('meanie');
      }
    }
    for (const p of view.players) {
      if (!this.mine.has(p.seat)) continue;
      if (p.gold >= 500) unlock('rich');
      if (p.items.length >= 10) unlock('full_inv');
      if (p.items.includes(ITEM.hero_sword) && p.items.includes(ITEM.hero_shield)) unlock('hero_set');
    }
  }
  gameOver(winner: number, countStats: boolean): void {
    if (!countStats) return;
    const charId = this.view?.players[winner]?.charId;
    update((s) => {
      s.stats.games++;
      if (this.mine.has(winner)) s.stats.wins++;
      if (this.mine.has(winner) && charId !== undefined) s.stats.charWins[charId] = (s.stats.charWins[charId] ?? 0) + 1;
    });
    const won = (n: number) => Array.from({ length: n }, (_, i) => i).every((i) => store().stats.charWins[i] > 0);
    if (won(BASE_CHAR_COUNT)) unlock('all5');
    if (won(CHARS.filter((c) => !c.unlock || !SECRET_UNLOCKS.includes(c.unlock)).length)) unlock('all7');
    if (this.mine.has(winner) && this.lastBossBy === winner && !this.fallen.has(winner)) unlock('nero');
    if (this.mine.has(winner)) unlock('first_win');
    if (store().stats.games >= 10) unlock('games10');
    if (store().stats.wins >= 5) unlock('wins5');
  }
}
