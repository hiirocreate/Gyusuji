import { ITEM } from './items.js';

export interface EnemyDef {
  id: string;
  name: string;
  hp: number;
  atkDice: number;
  str: number;
  def: number;
  goldDice: number;
  drop: number | null;
  /** 画像キー（chars/ 以下） */
  sprite: string;
  boss?: 'mid' | 'last';
}

/** マップの object.type → 敵定義 */
export const ENEMIES: Record<string, EnemyDef> = {
  enemy_slime: { id: 'enemy_slime', name: 'スライム', hp: 4, atkDice: 1, str: 0, def: 0, goldDice: 1, drop: ITEM.dice, sprite: 'enemy_slime' },
  enemy_crab: { id: 'enemy_crab', name: 'とげ甲虫', hp: 7, atkDice: 1, str: 0, def: 0, goldDice: 2, drop: ITEM.amulet, sprite: 'enemy_thornbug' },
  enemy_plant: { id: 'enemy_plant', name: '食虫花', hp: 11, atkDice: 1, str: 0, def: 0, goldDice: 3, drop: ITEM.paru, sprite: 'enemy_flytrap' },
  enemy_golem: { id: 'enemy_golem', name: 'ゴーレム', hp: 16, atkDice: 1, str: 2, def: 0, goldDice: 3, drop: ITEM.elixir, sprite: 'enemy_golem' },
  enemy_shadow: { id: 'enemy_shadow', name: '影騎士', hp: 22, atkDice: 2, str: 0, def: 0, goldDice: 3, drop: ITEM.iron_shield, sprite: 'enemy_shadow' },
  midboss_beast: { id: 'midboss_beast', name: '中ボス・獣', hp: 20, atkDice: 2, str: 0, def: 0, goldDice: 3, drop: ITEM.hero_sword, sprite: 'boss_beast', boss: 'mid' },
  midboss_demon: { id: 'midboss_demon', name: '中ボス・悪魔', hp: 30, atkDice: 2, str: 0, def: 0, goldDice: 3, drop: ITEM.hero_shield, sprite: 'boss_demon', boss: 'mid' },
  midboss_dragon: { id: 'midboss_dragon', name: '中ボス・竜', hp: 35, atkDice: 2, str: 2, def: 0, goldDice: 3, drop: ITEM.dragon_mail, sprite: 'boss_dragon', boss: 'mid' },
  lastboss_cow: { id: 'lastboss_cow', name: 'ラスボス・牛魔王', hp: 40, atkDice: 2, str: 0, def: 0, goldDice: 3, drop: null, sprite: 'boss_overlord', boss: 'last' },
  lastboss_king: { id: 'lastboss_king', name: 'ラスボス・魔王', hp: 60, atkDice: 2, str: 2, def: 0, goldDice: 0, drop: null, sprite: 'boss_overlord', boss: 'last' },
};

export function isEnemyType(t: string): boolean {
  return t in ENEMIES;
}
