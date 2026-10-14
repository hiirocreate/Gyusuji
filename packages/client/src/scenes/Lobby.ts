import Phaser from 'phaser';
import { net } from '../net.js';
import { clearUI, h, mount, toast } from '../ui.js';

export class Lobby extends Phaser.Scene {
  constructor() {
    super('Lobby');
  }

  create() {
    this.cameras.main.setBackgroundColor('#141a2e');
    this.render();
  }

  private async go(fn: () => Promise<void>) {
    try {
      await fn();
      this.scene.start('Room');
    } catch (e) {
      console.error(e);
      toast(`接続できませんでした：${(e as Error).message ?? e}`, 2500);
    }
  }

  private render() {
    clearUI();
    const code = h('input', { placeholder: 'ルームコード', maxLength: 5, style: 'width:120px;text-transform:uppercase' });
    const list = h('div', { class: 'col', style: 'max-height:150px;overflow:auto;min-width:360px' }, h('div', { class: 'muted' }, '読み込み中…'));
    mount(h('div', { class: 'screen' },
      h('div', { style: 'font-size:24px;font-weight:bold' }, 'ロビー'),
      h('div', { class: 'panel col', style: 'align-items:center' },
        h('div', { class: 'row' },
          h('button', { class: 'primary', onclick: () => this.go(() => net.create(false)) }, 'ルーム作成（コード）'),
          h('button', { class: 'primary', onclick: () => this.go(() => net.random()) }, 'ランダムマッチ')),
        h('div', { class: 'row' }, code, h('button', { onclick: () => code.value && this.go(() => net.joinByCode(code.value)) }, 'コードで入室'))),
      h('div', { class: 'panel col' }, h('div', {}, '進行中のルーム（観戦・途中参加）'), list),
      h('button', { onclick: () => this.scene.start('Title') }, 'もどる')));
    net.rooms().then((rooms) => {
      list.replaceChildren(...(rooms.length ? rooms.map((r) => h('div', { class: 'row' },
        h('span', { style: 'width:150px' }, `ルーム ${r.code}（${r.clients}人）`),
        h('button', { class: 'small', onclick: () => this.go(() => net.spectate(r.roomId)) }, '観戦'),
        ...[0, 1, 2, 3].map((s) => h('button', { class: 'small', title: 'ホストが許可したCPU枠に参加', onclick: () => this.go(() => net.joinById(r.roomId, { takeSeat: s })) }, `席${s + 1}に途中参加`)),
      )) : [h('div', { class: 'muted' }, '進行中のルームはありません')]));
    }).catch(() => list.replaceChildren(h('div', { class: 'muted' }, 'サーバに接続できません（設定でサーバURLを確認）')));
  }
}
