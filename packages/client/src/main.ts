import Phaser from 'phaser';
import { unlockAudio } from './audio.js';
import { say } from './chat.js';
import { layout, onLayout, watchLayout } from './layout.js';
import { Boot } from './scenes/Boot.js';
import { Menu } from './scenes/Menu.js';
import { Field } from './scenes/Field.js';
import { Battle } from './scenes/Battle.js';
import { Overlay } from './scenes/Overlay.js';
import { Status } from './scenes/Status.js';

watchLayout();
unlockAudio();

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: layout().w,
  height: layout().h,
  backgroundColor: '#000000',
  roundPixels: true,
  scale: { mode: Phaser.Scale.NONE },
  input: { activePointers: 2 },
  scene: [Boot, Menu, Field, Battle, Overlay, Status],
});

// 向きが変わってもゲーム・通信は止めずにレイアウトだけ切り替える
onLayout((l) => game.scale.resize(l.w, l.h));

(window as unknown as { game: Phaser.Game }).game = game;

// E2E・確認用：任意の送信者のメッセージを流す
(window as unknown as { __say: (from: string, text: string, color: string) => void }).__say = (from, text, color) => say({ from, text, color, system: false });
