import Phaser from 'phaser';
import { CHARS, C, DEFAULT_SETTINGS } from '@gyusuji/shared';
import type { SeatInit, Settings } from '@gyusuji/shared';
import { ACHIEVEMENTS } from '../achievements.js';
import { bgm, se } from '../audio.js';
import { charInfo, charPicker, face, settingsForm } from '../forms.js';
import { LocalHost, ReplayHost, net, rememberFriend, type ReplayData } from '../net.js';
import { store, update } from '../store.js';
import { clearUI, h, modal, mount, toast } from '../ui.js';

export class Title extends Phaser.Scene {
  constructor() {
    super('Title');
  }

  create() {
    this.cameras.main.setBackgroundColor('#141a2e');
    // 背景：主人公たちが歩く
    ['hero_summoner', 'hero_courier', 'hero_priest', 'hero_warrior', 'hero_spellknight'].forEach((k, i) => {
      const s = this.add.sprite(-80 - i * 90, 410, k).setScale(1.2).play(`${k}_right`);
      this.tweens.add({ targets: s, x: 940, duration: 9000, delay: i * 0, repeat: -1, onRepeat: () => (s.x = -80) });
    });
    bgm('title');
    this.render();
    void net.resume().then((ok) => ok && this.scene.start('Room'));
  }

  private render() {
    clearUI();
    const st = store();
    const name = h('input', { value: st.name, maxLength: C.NAME_MAX, placeholder: '名前（6文字まで）', style: 'width:160px;text-align:center' });
    const needName = () => {
      const v = name.value.trim().slice(0, C.NAME_MAX);
      if (!v) {
        toast('名前を入力してください');
        name.focus();
        return false;
      }
      update((s) => (s.name = v));
      return true;
    };
    mount(h('div', { class: 'screen', style: 'justify-content:flex-start;padding-top:40px' },
      h('div', { class: 'title' }, 'BEEF HUNTER'),
      h('div', { class: 'subtitle' }, 'すごろくバトル'),
      h('div', { class: 'row' }, h('span', {}, 'なまえ'), name),
      h('div', { class: 'row' },
        h('button', { class: 'primary', onclick: () => needName() && (se('select'), this.scene.start('Lobby')) }, 'オンライン対戦'),
        h('button', { class: 'primary', onclick: () => needName() && this.soloSetup() }, 'ひとりで遊ぶ'),
        h('button', { onclick: () => needName() && this.startTutorial() }, 'チュートリアル')),
      h('div', { class: 'row' },
        h('button', { onclick: () => this.records() }, '戦績・実績'),
        h('button', { onclick: () => this.friends() }, 'フレンド'),
        h('button', { onclick: () => this.options() }, '設定'),
        h('button', { onclick: () => this.loadReplay() }, 'リプレイ再生')),
      !st.tutorialDone && h('div', { class: 'muted' }, 'はじめての方は「チュートリアル」がおすすめです'),
    ));
  }

  private soloSetup() {
    let settings: Settings = { ...DEFAULT_SETTINGS };
    let charId = 0;
    let cpus = 3;
    const body = h('div', { class: 'col' });
    const draw = () => {
      body.replaceChildren(
        h('div', { class: 'row' }, face(charId), charInfo(charId)),
        charPicker(charId, (id) => { charId = id; draw(); }),
        h('div', { class: 'row' }, h('span', { class: 'muted' }, 'CPUの人数'),
          ...[1, 2, 3].map((n) => h('button', { class: `small ${n === cpus ? 'sel' : ''}`, onclick: () => { cpus = n; draw(); } }, `${n}人`))),
        settingsForm(settings, true, (p) => { settings = { ...settings, ...p }; draw(); }),
      );
    };
    draw();
    modal('ひとりで遊ぶ', body, [{
      label: 'スタート', cls: 'primary', on: () => {
        const seats: SeatInit[] = [{ name: store().name, charId, isCpu: false }];
        for (let i = 0; i < cpus; i++) seats.push({ name: `CPU${i + 1}`, charId: (charId + 1 + i) % CHARS.length, isCpu: true });
        this.scene.start('Field', { host: new LocalHost(settings, seats) });
      },
    }]);
  }

  private startTutorial() {
    // 短編マップを CPU1人と15ターン
    const settings = { ...DEFAULT_SETTINGS, map: 1, turnLimit: 15 as Settings['turnLimit'], kiwamiRate: 0 } as Settings;
    const host = new LocalHost(settings, [
      { name: store().name, charId: 4, isCpu: false },
      { name: 'CPU', charId: 0, isCpu: true },
    ]);
    host.tutorial = true;
    this.scene.start('Field', { host });
  }

  private records() {
    const s = store().stats;
    const body = h('div', { class: 'col' },
      h('div', {}, `対戦数 ${s.games}　優勝数 ${s.wins}　ラスボス撃破 ${s.lastBossKills}`),
      h('div', { style: 'display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px' },
        ...ACHIEVEMENTS.map((a) => h('div', { class: 'panel', style: `padding:4px 6px;opacity:${store().achievements[a.id] ? 1 : 0.4}` },
          h('div', { style: 'font-weight:bold' }, `${store().achievements[a.id] ? '🏆' : '🔒'} ${a.name}`),
          h('div', { class: 'muted' }, a.desc)))));
    modal('戦績・実績', body);
  }

  private friends() {
    const body = h('div', { class: 'col' });
    const draw = () => {
      const code = h('input', { placeholder: '8桁のコード', maxLength: 8, style: 'width:110px' });
      const nm = h('input', { placeholder: 'メモ（名前）', maxLength: 10, style: 'width:110px' });
      body.replaceChildren(
        h('div', {}, 'あなたのフレンドコード：', h('b', { style: 'font-size:18px;color:var(--accent)' }, store().friendCode)),
        h('div', { class: 'muted' }, 'お互いのコードを登録すると、相手のいるルームに直接参加できます'),
        h('div', { class: 'row' }, code, nm, h('button', {
          onclick: () => {
            if (!/^\d{8}$/.test(code.value)) return toast('8桁の数字を入力してください');
            rememberFriend(code.value, nm.value || code.value);
            draw();
          },
        }, '登録')),
        ...store().friends.map((f) => h('div', { class: 'row' },
          h('span', { style: 'width:200px' }, `${f.name}（${f.code}）`),
          h('button', {
            class: 'small', onclick: async () => {
              if (!store().name) return toast('先に名前を入力してください');
              try {
                await net.joinFriend(f.code);
                document.querySelectorAll('.screen').forEach((e) => e.remove());
                this.scene.start('Room');
              } catch (e) {
                toast((e as Error).message);
              }
            },
          }, '参加'),
          h('button', { class: 'small danger', onclick: () => { update((s) => (s.friends = s.friends.filter((x) => x.code !== f.code))); draw(); } }, '削除'))),
      );
    };
    draw();
    modal('フレンド', body);
  }

  private options() {
    const url = h('input', { value: store().serverUrl, style: 'width:300px' });
    const body = h('div', { class: 'col' },
      h('div', { class: 'row' }, '演出速度', ...([1, 2, 3] as const).map((n) => h('button', {
        class: `small ${store().speed === n ? 'sel' : ''}`,
        onclick: (e: Event) => { update((s) => (s.speed = n)); (e.target as HTMLElement).parentElement!.querySelectorAll('button').forEach((b, i) => b.classList.toggle('sel', i === n - 1)); },
      }, `${n}×`))),
      h('div', { class: 'row' }, 'サウンド', h('input', { type: 'checkbox', checked: store().sound, onchange: (e: Event) => { update((s) => (s.sound = (e.target as HTMLInputElement).checked)); if (!store().sound) bgm(null); } })),
      h('div', { class: 'row' }, 'サーバURL', url));
    modal('設定', body, [{ label: '保存', cls: 'primary', on: () => { update((s) => (s.serverUrl = url.value.trim())); net.reset(); } }]);
  }

  private loadReplay() {
    const inp = h('input', { type: 'file', accept: '.json,application/json' });
    inp.onchange = async () => {
      const f = inp.files?.[0];
      if (!f) return;
      try {
        const data = JSON.parse(await f.text()) as ReplayData;
        this.scene.start('Field', { host: new ReplayHost(data) });
      } catch {
        toast('リプレイファイルを読み込めませんでした');
      }
    };
    inp.click();
  }
}
