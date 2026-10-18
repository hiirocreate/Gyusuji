export interface CharDef {
  id: number;
  key: string;
  name: string;
  role: string;
  hp: number;
  mp: number;
  luck: number;
  /** 初期所持品（アイテムNo） */
  items: number[];
  stars: { hp: number; mp: number; luck: number };
  desc: string;
}

export const CHARS: CharDef[] = [
  { id: 0, key: 'summoner', name: 'メロウ', role: '召喚士', hp: 14, mp: 10, luck: 2, items: [17, 4, 4, 3], stars: { hp: 3, mp: 1, luck: 2 }, desc: '強力な召喚魔法' },
  { id: 1, key: 'courier', name: 'ハヤテ', role: '俊足', hp: 12, mp: 14, luck: 0, items: [12, 1, 1, 1, 3], stars: { hp: 2, mp: 2, luck: 0 }, desc: '運が0のため宝箱が爆発しやすい' },
  { id: 2, key: 'priest', name: 'ルミナ', role: '僧侶', hp: 10, mp: 20, luck: 4, items: [14, 16, 4, 3], stars: { hp: 1, mp: 3, luck: 3 }, desc: '最もMPが高い、回復魔法' },
  { id: 3, key: 'warrior', name: 'ガロウ', role: '戦士', hp: 15, mp: 0, luck: 1, items: [18, 4, 4, 3], stars: { hp: 3, mp: 0, luck: 1 }, desc: '魔法不可、通常攻撃最強' },
  { id: 4, key: 'spellknight', name: 'セリカ', role: '魔法剣士', hp: 12, mp: 14, luck: 2, items: [15, 4, 4, 3], stars: { hp: 2, mp: 2, luck: 2 }, desc: 'バランス型' },
  { id: 5, key: 'hunter', name: 'ホルン', role: '狩人', hp: 12, mp: 4, luck: 3, items: [26, 4, 1, 3], stars: { hp: 2, mp: 1, luck: 3 }, desc: '早撃ちの弓で戦闘開始時に先制攻撃' },
  { id: 6, key: 'chef', name: 'コトコ', role: '料理人', hp: 13, mp: 8, luck: 2, items: [27, 1, 1, 3], stars: { hp: 3, mp: 1, luck: 2 }, desc: '秘伝の鍋でりんごの回復量アップ' },
];
