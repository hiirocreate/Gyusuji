import Phaser from 'phaser';
import { unlockAudio } from './audio.js';
import { fitStage } from './ui.js';
import { Boot } from './scenes/Boot.js';
import { Title } from './scenes/Title.js';
import { Lobby } from './scenes/Lobby.js';
import { Room } from './scenes/Room.js';
import { Field } from './scenes/Field.js';
import { Battle } from './scenes/Battle.js';
import { Hud } from './scenes/Hud.js';
import { Result } from './scenes/Result.js';

fitStage();
window.addEventListener('resize', fitStage);
unlockAudio();

// 横画面固定（Capacitor / 対応ブラウザ）
const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
orientation?.lock?.('landscape').catch(() => {});

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 854,
  height: 480,
  backgroundColor: '#000000',
  pixelArt: false,
  scale: { mode: Phaser.Scale.NONE },
  input: { activePointers: 3 },
  scene: [Boot, Title, Lobby, Room, Field, Battle, Hud, Result],
});

// デバッグ・E2E 用
(window as unknown as { game: Phaser.Game }).game = game;
