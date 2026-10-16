import Phaser from 'phaser';
import { ENEMIES } from '@gyusuji/shared';
import type { PublicPlayer } from '@gyusuji/shared';
import { HEROES } from '../assets.js';
import { se } from '../audio.js';
import { fieldCam, frames, tween, wait } from './fieldcam.js';

/** 戦闘はフィールド領域 280×280 内で完結（UI_LAYOUT §6） */
export class Battle extends Phaser.Scene {
  enemy!: Phaser.GameObjects.Sprite;
  hero!: Phaser.GameObjects.Sprite;
  active = false;
  hp = 0;
  maxHp = 1;

  constructor() {
    super('Battle');
  }

  create() {
    fieldCam(this);
    this.add.rectangle(140, 140, 280, 280, 0x203040);
    // 紺の静かな背景。敵・プレイヤー・コマンドの座標は従来どおり。
    this.add.rectangle(140, 218, 280, 124, 0x1a2938);
    this.add.graphics().lineStyle(1, 0x6e8293, 0.4).strokeRect(0.5, 0.5, 279, 279);
    this.add.ellipse(80, 104, 90, 22, 0x000000, 0.35);
    this.add.ellipse(200, 222, 60, 16, 0x000000, 0.35);
    this.enemy = this.add.sprite(80, 80, 'enemy_slime').setScale(1.5);
    this.hero = this.add.sprite(200, 200, HEROES[0]).setScale(1.1);
    this.cameras.main.setVisible(false);
  }

  begin(enemyType: string, hp: number, p: PublicPlayer): void {
    const e = ENEMIES[enemyType];
    this.active = true;
    this.hp = hp;
    this.maxHp = e.hp;
    this.tweens.killTweensOf([this.enemy, this.hero]);
    this.enemy.setTexture(e.sprite).play(`${e.sprite}_idle`).setScale(e.boss ? 1.8 : 1.5).setAlpha(1).setPosition(80, 80).clearTint();
    if (enemyType === 'lastboss_king') this.enemy.setTint(0xff9090);
    this.hero.setTexture(HEROES[p.charId], 3 * 4).setAlpha(1).setAngle(0).setPosition(200, 200);
    this.hero.play(`${HEROES[p.charId]}_up`);
    this.cameras.main.setVisible(true);
  }

  /** 攻撃側が跳ねる(12f)→打撃エフェクト(5f) */
  async attack(byPlayer: boolean): Promise<void> {
    const a = byPlayer ? this.hero : this.enemy;
    const d = byPlayer ? this.enemy : this.hero;
    await tween(this, { targets: a, y: a.y - 14, yoyo: true, duration: frames(6) });
    se('hit');
    const h = this.add.sprite(d.x, d.y, 'fx/hit').play('fx/hit');
    d.setTintFill(0xffffff);
    await wait(this, frames(5));
    d.clearTint();
    h.destroy();
  }

  async magic(fx: string): Promise<void> {
    if (fx === 'fire') {
      se('fire');
      const f = this.add.sprite(this.enemy.x, this.enemy.y, 'fx/fire').play('fx/fire');
      await wait(this, frames(10));
      f.destroy();
    } else if (fx === 'summon') {
      se('summon');
      const c = this.add.sprite(this.enemy.x, this.enemy.y + 16, 'fx/summon_circle').play('fx/summon_circle');
      this.cameras.main.flash(200, 255, 255, 255);
      const s = this.add.image(this.enemy.x, -60, 'fx/summon_seed').setScale(0.7);
      await tween(this, { targets: s, y: this.enemy.y, duration: frames(10), ease: 'Quad.easeIn' });
      this.cameras.main.shake(200, 0.02);
      s.destroy();
      c.destroy();
    }
  }

  async phase2(): Promise<void> {
    this.cameras.main.shake(500, 0.02);
    this.enemy.setTint(0xff4040).setScale(2.1);
    await wait(this, frames(16));
  }

  async end(result: 'win' | 'lose' | 'leave'): Promise<void> {
    if (result === 'win') {
      se('explode');
      const x = this.add.sprite(this.enemy.x, this.enemy.y, 'fx/explosion').setScale(1.5).play('fx/explosion');
      await tween(this, { targets: this.enemy, alpha: 0, duration: frames(10) });
      await wait(this, frames(8));
      x.destroy();
    } else if (result === 'lose') {
      se('lose');
      await tween(this, { targets: this.hero, alpha: 0, angle: 90, duration: frames(12) });
    }
    await wait(this, frames(6));
    this.tweens.killTweensOf([this.enemy, this.hero]);
    this.cameras.main.setVisible(false);
    this.active = false;
  }
}
