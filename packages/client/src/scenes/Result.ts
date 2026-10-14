import Phaser from 'phaser';
import { CHARS } from '@gyusuji/shared';
import type { PublicView } from '@gyusuji/shared';
import { bgm } from '../audio.js';
import { face } from '../forms.js';
import { LocalHost, ReplayHost, net, type Host, type ReplayData } from '../net.js';
import { clearUI, h, mount, toast } from '../ui.js';

export class Result extends Phaser.Scene {
  constructor() {
    super('Result');
  }

  create(data: { host: Host; view: PublicView; reason: string }) {
    this.cameras.main.setBackgroundColor('#141a2e');
    clearUI();
    const { host, view } = data;
    const winner = view.players[view.winner];
    const ranked = [...view.players].sort((a, b) => (a.seat === view.winner ? -1 : b.seat === view.winner ? 1 : a.rank - b.rank));
    const dl = async () => {
      const d = await host.replayData();
      if (!d) return toast('リプレイを取得できませんでした');
      const a = h('a', { href: URL.createObjectURL(new Blob([JSON.stringify(d)], { type: 'application/json' })), download: `beefhunter_replay_${Date.now()}.json` });
      a.click();
    };
    const replay = async () => {
      const d = (await host.replayData()) as ReplayData | null;
      if (!d) return toast('リプレイを取得できませんでした');
      this.scene.start('Field', { host: new ReplayHost(d) });
    };
    const rematchBtn = h('button', { class: 'primary', onclick: () => this.rematch(host, rematchBtn) }, 'リマッチ');
    mount(h('div', { class: 'screen' },
      h('div', { class: 'title', style: 'font-size:30px' }, winner ? `優勝者は ${winner.name} さんです！` : 'ゲーム終了'),
      h('div', { class: 'muted' }, data.reason),
      h('div', { class: 'row' }, ...ranked.map((p, i) => h('div', { class: 'panel col', style: 'align-items:center;width:150px' },
        h('div', { style: `font-weight:bold;color:${i === 0 ? 'var(--accent)' : 'var(--text)'}` }, i === 0 ? '👑 優勝' : `${i + 1}位`),
        face(p.charId),
        h('div', {}, p.name),
        h('div', { class: 'muted' }, `${CHARS[p.charId].role}　${p.steps}歩　${p.gold}G`)))),
      h('div', { class: 'row' },
        host.kind !== 'replay' && rematchBtn,
        h('button', { onclick: dl }, 'リプレイ保存'),
        h('button', { onclick: replay }, 'リプレイ再生'),
        h('button', { onclick: () => { if (host.kind === 'online') net.leave(); this.scene.start('Title'); } }, 'タイトルへ'))));
    bgm('win');
  }

  private rematch(host: Host, btn: HTMLButtonElement) {
    if (host instanceof LocalHost) {
      this.scene.start('Field', { host: Object.assign(new LocalHost(host.settings, host.seats), { tutorial: host.tutorial }) });
      return;
    }
    if (host.kind === 'online') {
      net.send('rematch');
      btn.disabled = true;
      btn.textContent = '全員の参加待ち…';
      const off = net.started.on((h2) => { off(); this.scene.start('Field', { host: h2 }); });
    }
  }
}
