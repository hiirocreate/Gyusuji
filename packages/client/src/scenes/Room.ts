import Phaser from 'phaser';
import { CHAT_COLORS, STAMPS } from '@gyusuji/shared';
import type { Settings } from '@gyusuji/shared';
import { charInfo, charPicker, face, settingsForm } from '../forms.js';
import { net, type ChatMsg } from '../net.js';
import { store, update } from '../store.js';
import { clearUI, h, mount } from '../ui.js';

interface SeatV { name: string; charId: number; kind: string; ready: boolean; connected: boolean; proxy: boolean }

export class Room extends Phaser.Scene {
  private offs: (() => void)[] = [];
  private chatLog: ChatMsg[] = [];
  private chatEl: HTMLElement | null = null;

  constructor() {
    super('Room');
  }

  create() {
    this.cameras.main.setBackgroundColor('#141a2e');
    this.chatLog = [];
    this.offs = [
      net.changed.on(() => this.render()),
      net.chat.on((m) => { this.chatLog.push(m); this.drawChat(); }),
      net.started.on((host) => this.scene.start('Field', { host })),
    ];
    this.events.once('shutdown', () => this.offs.forEach((f) => f()));
    if (net.host) {
      this.scene.start('Field', { host: net.host });
      return;
    }
    this.render();
  }

  private render() {
    if (!this.scene.isActive()) return;
    clearUI();
    const room = net.room;
    if (!room) {
      mount(h('div', { class: 'screen' }, h('div', {}, '接続が切れました'), h('button', { onclick: () => this.scene.start('Lobby') }, 'ロビーへ')));
      return;
    }
    const st = room.state as { phase: string; code: string; host: number; allowJoin: boolean; seats: SeatV[]; settings: Settings; spectators: number };
    if (st.phase !== 'lobby') {
      mount(h('div', { class: 'screen' }, h('div', {}, 'ゲーム進行中… 同期しています')));
      return;
    }
    const me = net.seat;
    const isHost = me >= 0 && me === st.host;
    const seats = [...st.seats];
    const seatEls = seats.map((s, i) => h('div', { class: 'panel seat' },
      h('div', { class: 'muted' }, `席${i + 1}${i === st.host ? '（ホスト）' : ''}`),
      s.kind === 'empty' ? h('div', { style: 'height:64px;line-height:64px' }, '空き') : face(s.charId),
      h('div', { style: 'font-weight:bold' }, s.kind === 'empty' ? '―' : s.name),
      s.kind === 'human' && h('div', { style: `color:${s.ready ? 'var(--ok)' : 'var(--sub)'}` }, s.ready ? '準備OK' : '準備中'),
      s.kind === 'cpu' && h('div', { class: 'muted' }, 'CPU'),
      isHost && s.kind !== 'human' && h('button', { class: 'small', onclick: () => net.send('setCpu', { seat: i, on: s.kind !== 'cpu' }) }, s.kind === 'cpu' ? '空きにする' : 'CPU追加'),
    ));
    const mySeat = me >= 0 ? seats[me] : null;
    const input = h('input', { placeholder: 'チャット', maxLength: 80, style: 'flex:1' });
    const sendChat = () => { if (input.value.trim()) net.send('chat', { text: input.value, color: store().chatColor }); input.value = ''; };
    input.addEventListener('keydown', (e) => e.key === 'Enter' && sendChat());
    this.chatEl = h('div', { class: 'chatlog', style: 'height:110px' });
    mount(h('div', { class: 'screen', style: 'justify-content:flex-start;padding:8px;gap:6px' },
      h('div', { class: 'row' }, h('b', { style: 'font-size:18px' }, `ルームコード：${st.code}`), h('span', { class: 'muted' }, `観戦 ${st.spectators}人`),
        h('button', { class: 'small danger', onclick: () => { net.leave(); this.scene.start('Lobby'); } }, '退室')),
      h('div', { class: 'row', style: 'flex-wrap:nowrap' }, ...seatEls),
      h('div', { class: 'row', style: 'align-items:flex-start;flex-wrap:nowrap;width:820px' },
        h('div', { class: 'panel col', style: 'width:300px' },
          mySeat && charInfo(mySeat.charId),
          mySeat && charPicker(mySeat.charId, (id) => net.send('setChar', { id })),
          mySeat && h('button', { class: mySeat.ready ? '' : 'primary', onclick: () => net.send('ready', { on: !mySeat.ready }) }, mySeat.ready ? '準備を取り消す' : '開始（準備OK）'),
          h('div', { class: 'muted' }, '全員が「開始」を押すとゲームが始まります')),
        h('div', { class: 'panel col', style: 'width:250px' },
          isHost && h('div', { class: 'row' },
            h('button', { class: 'small', onclick: () => net.send('setSettings', { preset: 'classic' }) }, 'クラシック'),
            h('button', { class: 'small', onclick: () => net.send('setSettings', { preset: 'ext' }) }, '拡張')),
          settingsForm({ ...st.settings }, isHost, (p) => net.send('setSettings', p)),
          isHost && h('label', { class: 'row' }, h('input', { type: 'checkbox', checked: st.allowJoin, onchange: (e: Event) => net.send('allowJoin', { on: (e.target as HTMLInputElement).checked }) }), 'CPU枠への途中参加を許可')),
        h('div', { class: 'panel col', style: 'flex:1' },
          this.chatEl,
          h('div', { class: 'row', style: 'flex-wrap:nowrap' }, input,
            ...CHAT_COLORS.map((c, i) => h('button', { class: `small ${store().chatColor === i ? 'sel' : ''}`, style: `background:${c};width:18px;height:18px;padding:0`, onclick: () => { update((s) => (s.chatColor = i)); this.render(); } })),
            h('button', { class: 'small', onclick: sendChat }, '送信')),
          h('div', { class: 'row' }, ...STAMPS.slice(0, 4).map((t) => h('button', { class: 'small', onclick: () => net.send('chat', { text: t, color: store().chatColor }) }, t)))),
      )));
    this.drawChat();
  }

  private drawChat() {
    if (!this.chatEl) return;
    this.chatEl.replaceChildren(...this.chatLog.slice(-40).map((m) => h('div', { style: `color:${m.color}` }, m.system ? `※ ${m.text}` : `${m.from}：${m.text}`)));
    this.chatEl.scrollTop = 1e6;
  }
}
