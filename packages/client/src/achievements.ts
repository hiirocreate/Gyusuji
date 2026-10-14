import { ENEMIES, ITEM } from '@gyusuji/shared';
import type { GameEvent, PublicView } from '@gyusuji/shared';
import { store, update } from './store.js';
import { toast } from './ui.js';

export const ACHIEVEMENTS: { id: string; name: string; desc: string }[] = [
  { id: 'first_win', name: '初優勝', desc: 'はじめて優勝する' },
  { id: 'lastboss', name: 'ハンター', desc: 'ラスボスを倒す' },
  { id: 'kiwami', name: '極めし者', desc: 'ぱるぷん玉<極>を引く' },
  { id: 'casino3', name: '勝負師', desc: '賭場で3連勝する' },
  { id: 'games10', name: '常連', desc: '10回対戦する' },
  { id: 'wins5', name: '王者', desc: '5回優勝する' },
  { id: 'rich', name: '大富豪', desc: '所持金500G以上になる' },
  { id: 'full_inv', name: 'コレクター', desc: '所持品を10枠埋める' },
  { id: 'midboss', name: '番人狩り', desc: '中ボスを倒す' },
  { id: 'elixir', name: '不死身', desc: 'エリクサーで復活する' },
  { id: 'tutorial', name: '入門', desc: 'チュートリアルを完了する' },
  { id: 'hero_set', name: '伝説の装備', desc: '勇者の剣と勇者の盾を同時に持つ' },
];

export function unlock(id: string): void {
  if (store().achievements[id]) return;
  update((s) => (s.achievements[id] = Date.now()));
  const a = ACHIEVEMENTS.find((x) => x.id === id);
  if (a) toast(`🏆 実績解除：${a.name}`, 2500);
}

/** 自分の席に関するイベントを見て実績を更新 */
export class Tracker {
  private lastCasino = false;
  private battleEnemy = '';
  constructor(private mine: Set<number>) {}
  feed(events: GameEvent[], view: PublicView): void {
    for (const e of events) {
      const me = 'seat' in e && this.mine.has(e.seat as number);
      if (e.t === 'paru' && me && e.kiwami) unlock('kiwami');
      if (e.t === 'revive' && me) unlock('elixir');
      if (e.t === 'battleStart' && me) this.battleEnemy = e.enemy;
      if (e.t === 'battleEnd' && me && e.result === 'win') {
        const b = ENEMIES[this.battleEnemy]?.boss;
        if (b === 'mid') unlock('midboss');
        if (b === 'last') {
          unlock('lastboss');
          update((s) => s.stats.lastBossKills++);
        }
      }
      if (e.t === 'dice' && me && e.purpose === 'casino') this.lastCasino = true;
      else if (e.t === 'gold' && me && this.lastCasino) {
        this.lastCasino = false;
        update((s) => (s.stats.casinoStreak = e.amount > 0 ? s.stats.casinoStreak + 1 : 0));
        if (store().stats.casinoStreak >= 3) unlock('casino3');
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
    update((s) => {
      s.stats.games++;
      if (this.mine.has(winner)) s.stats.wins++;
    });
    if (this.mine.has(winner)) unlock('first_win');
    if (store().stats.games >= 10) unlock('games10');
    if (store().stats.wins >= 5) unlock('wins5');
  }
}
