import { CHARS, MAP_NAMES } from '@gyusuji/shared';
import type { Settings } from '@gyusuji/shared';
import { h } from './ui.js';

type Field = { key: keyof Settings; label: string; opts: [unknown, string][] };

export const SETTING_FIELDS: Field[] = [
  { key: 'map', label: 'マップ', opts: [[0, MAP_NAMES[0]], [1, MAP_NAMES[1]], [2, MAP_NAMES[2]]] },
  { key: 'rule', label: 'ルール', opts: [['ext', '拡張'], ['classic', 'クラシック']] },
  { key: 'turnLimit', label: 'ターン上限', opts: [[0, 'なし'], [30, '30'], [50, '50'], [80, '80']] },
  { key: 'limitWinner', label: '上限時の勝者', opts: [['steps', '歩数最多'], ['gold', '所持金最多']] },
  { key: 'startGold', label: '初期所持金', opts: [[20, '20G'], [50, '50G'], [100, '100G']] },
  { key: 'kiwamiRate', label: '極の出現率', opts: [[0, '0%'], [20, '20%'], [50, '50%']] },
  { key: 'cpuLevel', label: 'CPUの強さ', opts: [['weak', '弱い'], ['normal', '普通'], ['strong', '強い']] },
  { key: 'timeLimit', label: '制限時間', opts: [[30, '30秒'], [60, '60秒'], [90, '90秒']] },
];

/** ルーム設定フォーム */
export function settingsForm(s: Settings, editable: boolean, onChange: (patch: Partial<Settings>) => void, fields = SETTING_FIELDS): HTMLElement {
  return h('div', { class: 'grid2' },
    ...fields.flatMap((f) => [
      h('span', { class: 'muted' }, f.label),
      h('select', {
        disabled: !editable,
        onchange: (e: Event) => {
          const raw = (e.target as HTMLSelectElement).value;
          const v = f.opts.find(([o]) => String(o) === raw)?.[0];
          onChange({ [f.key]: v } as Partial<Settings>);
        },
      }, ...f.opts.map(([v, l]) => h('option', { value: String(v), selected: s[f.key] === v }, l))),
    ]));
}

export function stars(n: number): string {
  return n ? '★'.repeat(n) : 'なし';
}

/** キャラ選択 */
export function charPicker(cur: number, onPick: (id: number) => void, enabled = true): HTMLElement {
  return h('div', { class: 'row' },
    ...CHARS.map((c) => h('button', {
      class: `small ${c.id === cur ? 'sel' : ''}`, disabled: !enabled, title: c.desc, onclick: () => onPick(c.id),
    }, `${c.role}`)));
}

export function charInfo(id: number): HTMLElement {
  const c = CHARS[id];
  return h('div', { class: 'col', style: 'gap:1px;align-items:center' },
    h('div', { style: 'font-weight:bold' }, `${c.name}（${c.role}）`),
    h('div', { class: 'stars' }, `HP${stars(c.stars.hp)} MP${stars(c.stars.mp)} 運${stars(c.stars.luck)}`),
    h('div', { class: 'muted' }, c.desc));
}

/** キャラの顔（スプライト1コマ目）を canvas に描く */
export function face(charId: number): HTMLElement {
  const keys = ['summoner', 'courier', 'priest', 'warrior', 'spellknight'];
  return h('div', { class: 'face', style: `background:url(./assets/img/chars/hero_${keys[charId]}.png) 0 0 / 256px 256px;width:64px;height:64px;image-rendering:pixelated` });
}
