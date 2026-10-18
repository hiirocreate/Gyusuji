export type ItemKind = 'consume' | 'auto' | 'weapon' | 'shield' | 'shoes' | 'magic' | 'passive';

export interface ItemDef {
  no: number;
  key: string;
  name: string;
  kind: ItemKind;
  /** 価格（null=非売） */
  price: number | null;
  field: boolean;
  battle: boolean;
  mp?: number;
  atk?: number;
  def?: number;
  /** v2 拡張アイテム */
  ext?: boolean;
  /** キャラ固有アイテム */
  unique?: boolean;
  /** 使っても消えない */
  keep?: boolean;
  /** 奪われない・失わない */
  noLoss?: boolean;
  desc: string;
}

export const ITEM = {
  apple: 1, elixir: 2, amulet: 3, dice: 4, ichi: 5, dagger: 6, iron_sword: 7, hero_sword: 8,
  wood_shield: 9, iron_shield: 10, hero_shield: 11, run_shoes: 12, safe_shoes: 13,
  mag_heal: 14, mag_fire: 15, mag_luck: 16, mag_summon: 17, sword_orb: 18, paru: 19,
  piyo: 20, absorb: 21, curse: 22, dragon_mail: 23, warp_scroll: 24, dummy_doll: 25,
  hunter_bow: 26, secret_pot: 27, joker: 28, chaos_dice: 29,
} as const;

const L: ItemDef[] = [
  { no: 1, key: 'apple', name: 'りんご', kind: 'consume', price: 10, field: true, battle: true, desc: '2ダイスの合計だけHP回復' },
  { no: 2, key: 'elixir', name: 'エリクサー', kind: 'auto', price: 30, field: false, battle: false, desc: 'HP0時に自動消費し、その場でHP全回復' },
  { no: 3, key: 'amulet', name: 'アミュレット', kind: 'consume', price: 20, field: true, battle: false, desc: '使用した場所を復活地点に保存' },
  { no: 4, key: 'dice', name: 'さいころ', kind: 'consume', price: 5, field: true, battle: true, desc: '移動・攻撃のダイスを1個増やす' },
  { no: 5, key: 'ichi', name: 'いちころ', kind: 'consume', price: 15, field: true, battle: true, desc: '必ず1が出る（移動1マス、戦闘では1ダメージ）' },
  { no: 6, key: 'dagger', name: '短剣', kind: 'weapon', price: 20, field: false, battle: false, atk: 1, desc: '攻撃力+1' },
  { no: 7, key: 'iron_sword', name: '鉄の剣', kind: 'weapon', price: 40, field: false, battle: false, atk: 2, desc: '攻撃力+2' },
  { no: 8, key: 'hero_sword', name: '勇者の剣', kind: 'weapon', price: null, field: false, battle: false, atk: 3, desc: '攻撃力+3' },
  { no: 9, key: 'wood_shield', name: '木の盾', kind: 'shield', price: 30, field: false, battle: false, def: 1, desc: '防御力+1' },
  { no: 10, key: 'iron_shield', name: '鉄の盾', kind: 'shield', price: 50, field: false, battle: false, def: 2, desc: '防御力+2' },
  { no: 11, key: 'hero_shield', name: '勇者の盾', kind: 'shield', price: null, field: false, battle: false, def: 3, desc: '防御力+3' },
  { no: 12, key: 'run_shoes', name: '運動靴', kind: 'shoes', price: null, field: false, battle: false, desc: '移動ダイスが常に2個' },
  { no: 13, key: 'safe_shoes', name: '安全靴', kind: 'shoes', price: null, field: false, battle: false, desc: 'がびょうダメージ無効' },
  { no: 14, key: 'mag_heal', name: '恩恵', kind: 'magic', price: 30, field: true, battle: true, mp: 4, desc: 'MP4：3ダイス回復＋呪い解除' },
  { no: 15, key: 'mag_fire', name: '焦火', kind: 'magic', price: 30, field: false, battle: true, mp: 2, desc: 'MP2：2ダイスのダメージ' },
  { no: 16, key: 'mag_luck', name: '幸運', kind: 'magic', price: 30, field: true, battle: false, mp: 5, desc: 'MP5：3ダイスでお金・回復・運+1のどれか' },
  { no: 17, key: 'mag_summon', name: 'すいか様', kind: 'magic', price: 50, field: false, battle: true, mp: 10, desc: 'MP10：3ダイスのダメージ' },
  { no: 18, key: 'sword_orb', name: '剣玉', kind: 'passive', price: 50, field: false, battle: false, desc: '攻撃ダイス+1個' },
  { no: 19, key: 'paru', name: 'ぱるぷん玉', kind: 'consume', price: 20, field: true, battle: false, desc: '1ダイスで全員に何かが起こる' },
  { no: 20, key: 'piyo', name: 'ひよこ', kind: 'consume', price: null, field: true, battle: false, desc: '1位を2ターン行動停止' },
  { no: 21, key: 'absorb', name: '吸収玉', kind: 'consume', price: null, field: true, battle: false, desc: '他プレイヤーからアイテムを1つ奪う' },
  { no: 22, key: 'curse', name: 'ノロイ', kind: 'consume', price: null, field: true, battle: false, desc: '自分以外の全員を呪い状態にする' },
  { no: 23, key: 'dragon_mail', name: '竜鱗の鎧', kind: 'shield', price: null, field: false, battle: false, def: 4, ext: true, desc: '防御力+4' },
  { no: 24, key: 'warp_scroll', name: 'ワープの書', kind: 'consume', price: 40, field: true, battle: false, ext: true, desc: '復活地点へ移動' },
  { no: 25, key: 'dummy_doll', name: '身代わり人形', kind: 'auto', price: null, field: false, battle: false, ext: true, desc: '妨害を1回だけ無効化' },
  { no: 26, key: 'hunter_bow', name: '早撃ちの弓', kind: 'passive', price: null, field: false, battle: false, unique: true, desc: '戦闘開始時に先制で1ダイスのダメージ' },
  { no: 27, key: 'secret_pot', name: '秘伝の鍋', kind: 'passive', price: null, field: false, battle: false, unique: true, desc: 'りんごの回復が3ダイス＋2になる' },
  { no: 28, key: 'joker', name: 'ジョーカーの札', kind: 'magic', price: null, field: true, battle: false, mp: 2, unique: true, desc: 'MP2：自分に3ダメージ／誰か1人に2ダメージ／MP2回復して他の全員に5ダメージのどれか' },
  { no: 29, key: 'chaos_dice', name: '狂乱のサイコロ', kind: 'consume', price: null, field: true, battle: true, unique: true, keep: true, noLoss: true, desc: '出目ごとに特殊効果。出目は移動・攻撃にも加わる。消えず奪われない' },
];

export const ITEMS: Record<number, ItemDef> = Object.fromEntries(L.map((i) => [i.no, i]));

export const SHOP_A = [ITEM.apple, ITEM.elixir, ITEM.amulet, ITEM.dice, ITEM.ichi, ITEM.mag_heal, ITEM.mag_luck];
export const SHOP_A_EXT = [...SHOP_A, ITEM.warp_scroll];
export const SHOP_B = [ITEM.dagger, ITEM.iron_sword, ITEM.wood_shield, ITEM.iron_shield, ITEM.mag_fire, ITEM.mag_summon, ITEM.sword_orb];
export const SMITH: { item: number; price: number }[] = [
  { item: ITEM.hero_sword, price: 120 },
  { item: ITEM.hero_shield, price: 150 },
];

/** 宝箱テーブル（0=爆発） idx0〜15 + 長編拡張 16,17 */
export const TREASURE_TABLE: number[] = [
  0, 0, 0, 0,
  ITEM.apple, ITEM.apple,
  ITEM.dice, ITEM.dice,
  ITEM.amulet, ITEM.ichi, ITEM.elixir, ITEM.paru, ITEM.amulet, ITEM.paru, ITEM.ichi, ITEM.paru,
  ITEM.dummy_doll, ITEM.warp_scroll,
];
