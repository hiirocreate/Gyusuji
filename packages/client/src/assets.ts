import index from '../public/assets/img/assets_index.json';

export const HEROES = ['hero_summoner', 'hero_courier', 'hero_priest', 'hero_warrior', 'hero_spellknight', 'hero_hunter', 'hero_chef'];
export const MONSTERS = ['enemy_slime', 'enemy_thornbug', 'enemy_flytrap', 'enemy_golem', 'enemy_shadow', 'boss_beast', 'boss_demon', 'boss_dragon', 'boss_overlord'];
export const NPC_OF: Record<string, string> = {
  priest: 'npc/priest', inn: 'npc/inn', shop: 'npc/merchant', shoes: 'npc/shoesage', smith: 'npc/smith', casino: 'npc/dealer',
};
export const OBJ_OF: Record<string, string> = {
  treasure: 'obj/chest-hd', qbox: 'obj/qbox-hd', tack: 'obj/tack-hd', tack_big: 'obj/tack_big-hd', gold_small: 'obj/gold_small-hd', gold_large: 'obj/gold_large-hd',
};
/** 向き → スプライトシートの行（下・左・右・上） */
export const DIR_ROW = { down: 0, left: 1, right: 2, up: 3 } as const;

export const SHEETS = index as unknown as Record<string, { frame: [number, number]; frames: number }>;

/** 原作地形番号(1〜36) → タイル */
export function classicTile(t: number): string {
  if (t === 3) return 'sea';
  if (t >= 12 && t <= 18) return 'tiles/mountain';
  if (t >= 28) return 'tiles/sand';
  return 'tiles/grass';
}
export function v2Tile(t: number): string {
  return ['sea', 'tiles/grass', 'tiles/forest', 'tiles/mountain', 'tiles/sand'][t] ?? 'tiles/grass';
}

/** アイテムNo → アイコン画像の切り出し位置 CSS */
export function iconStyle(no: number): string {
  return `background:url(./assets/img/items/icons-hd.png) ${-(no - 1) * 32}px 0 / 864px 32px no-repeat;width:32px;height:32px;display:inline-block;flex:none`;
}
