import Phaser from 'phaser';
import { ENEMIES } from '@gyusuji/shared';
import type { PublicPlayer } from '@gyusuji/shared';
import { HEROES } from '../assets.js';
import { se } from '../audio.js';
import { store } from '../store.js';

/** 戦闘画面（フィールドの上に重ねる） */
export class Battle extends Phaser.Scene {
  private enemy!: Phaser.GameObjects.Sprite;
  private hero!: Phaser.GameObjects.Sprite;
  private ebar!: Phaser.GameObjects.Rectangle;
  private pbar!: Phaser.GameObjects.Rectangle;
  private etext!: Phaser.GameObjects.Text;
  private ptext!: Phaser.GameObjects.Text;
  private ename!: Phaser.GameObjects.Text;
  private hp = 0;
  private maxHp = 1;
  private php = 0;
  private pmax = 1;
  active = false;

  constructor() {
    super('Battle');
  }

  create() {
    this.cameras.main.setViewport(0, 0, 640, 480);
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x1a1030, 0x1a1030, 0x3a2050, 0x3a2050, 1);
    bg.fillRect(0, 0, 640, 480);
    bg.fillStyle(0x2a5a2a, 1).fillEllipse(470, 280, 300, 70).fillEllipse(170, 340, 260, 60);
    this.enemy = this.add.sprite(470, 230, 'enemy_slime').setScale(3);
    this.hero = this.add.sprite(170, 300, HEROES[0]).setScale(2.4);
    this.ename = this.add.text(40, 40, '', { fontSize: '18px', color: '#fff', stroke: '#000', strokeThickness: 4 });
    this.add.rectangle(40, 70, 220, 12, 0x333333).setOrigin(0, 0.5);
    this.ebar = this.add.rectangle(40, 70, 220, 12, 0xff5d6c).setOrigin(0, 0.5);
    this.etext = this.add.text(270, 62, '', { fontSize: '14px', color: '#fff' });
    this.add.rectangle(380, 70, 220, 12, 0x333333).setOrigin(0, 0.5);
    this.pbar = this.add.rectangle(380, 70, 220, 12, 0x6be38a).setOrigin(0, 0.5);
    this.ptext = this.add.text(380, 40, '', { fontSize: '14px', color: '#fff', stroke: '#000', strokeThickness: 3 });
    this.cameras.main.setVisible(false);
  }

  private wait(ms: number) {
    return new Promise<void>((r) => this.time.delayedCall(ms / store().speed, r));
  }

  begin(enemyType: string, hp: number, p: PublicPlayer): void {
    const e = ENEMIES[enemyType];
    this.active = true;
    this.hp = hp;
    this.maxHp = e.hp;
    this.php = p.hp;
    this.pmax = p.maxHp;
    this.enemy.setTexture(e.sprite).play(`${e.sprite}_idle`).setScale(e.boss ? 3.6 : 3).clearTint();
    if (enemyType === 'lastboss_king') this.enemy.setTint(0xff9090);
    this.hero.setTexture(HEROES[p.charId]).play(`${HEROES[p.charId]}_right`);
    this.ename.setText(e.name);
    this.ptext.setText(`${p.name}  HP ${p.hp}/${p.maxHp}`);
    this.bars();
    this.cameras.main.setVisible(true).setAlpha(1);
  }

  private bars() {
    this.ebar.width = 220 * Math.max(0, this.hp / this.maxHp);
    this.etext.setText(`${Math.max(0, this.hp)}/${this.maxHp}`);
    this.pbar.width = 220 * Math.max(0, this.php / this.pmax);
    this.ptext.setText(this.ptext.text.replace(/HP .*/, `HP ${Math.max(0, this.php)}/${this.pmax}`));
  }

  async hit(target: 'enemy' | 'player', amount: number, fx: string): Promise<void> {
    const atk = target === 'enemy' ? this.hero : this.enemy;
    const def = target === 'enemy' ? this.enemy : this.hero;
    const dx = target === 'enemy' ? 30 : -30;
    await new Promise<void>((r) => this.tweens.add({ targets: atk, x: atk.x + dx, y: atk.y - 16, yoyo: true, duration: (12 / 24) * 500 / store().speed, onComplete: () => r() }));
    if (fx === 'fire') {
      se('fire');
      const f = this.add.sprite(def.x, def.y, 'fx/fire').setScale(2.5).play('fx/fire');
      await this.wait(500);
      f.destroy();
    } else if (fx === 'summon') {
      se('summon');
      const c = this.add.sprite(def.x, def.y + 40, 'fx/summon_circle').setScale(2.5).play('fx/summon_circle');
      this.cameras.main.flash(250, 255, 255, 255);
      const seed = this.add.image(def.x, -80, 'fx/summon_seed').setScale(1.5);
      await new Promise<void>((r) => this.tweens.add({ targets: seed, y: def.y, duration: 500 / store().speed, ease: 'Quad.easeIn', onComplete: () => r() }));
      this.cameras.main.shake(250, 0.02);
      seed.destroy();
      c.destroy();
    }
    se('hit');
    const h = this.add.sprite(def.x, def.y, 'fx/hit').setScale(2).play('fx/hit');
    def.setTintFill(0xffffff);
    this.time.delayedCall(120, () => def.clearTint());
    if (target === 'enemy') this.hp -= amount;
    else this.php -= amount;
    this.bars();
    const t = this.add.text(def.x, def.y - 60, String(amount), { fontSize: '30px', color: target === 'enemy' ? '#ffe060' : '#ff6060', stroke: '#000', strokeThickness: 5 }).setOrigin(0.5);
    this.tweens.add({ targets: t, y: t.y - 30, alpha: 0, duration: 900 / store().speed, onComplete: () => t.destroy() });
    await this.wait(500);
    h.destroy();
  }

  heal(amount: number): void {
    this.php = Math.min(this.pmax, this.php + amount);
    this.bars();
    const f = this.add.sprite(this.hero.x, this.hero.y, 'fx/heal').setScale(2).play('fx/heal');
    this.time.delayedCall(700, () => f.destroy());
  }

  revive(): void {
    this.php = this.pmax;
    this.bars();
  }

  async phase2(): Promise<void> {
    this.cameras.main.shake(600, 0.02);
    this.enemy.setTint(0xff4040).setScale(4.2);
    await this.wait(800);
  }

  async end(result: 'win' | 'lose' | 'leave'): Promise<void> {
    if (result === 'win') {
      se('explode');
      const x = this.add.sprite(this.enemy.x, this.enemy.y, 'fx/explosion').setScale(3).play('fx/explosion');
      this.tweens.add({ targets: this.enemy, alpha: 0, duration: 400 / store().speed });
      await this.wait(900);
      x.destroy();
    } else if (result === 'lose') {
      se('lose');
      this.tweens.add({ targets: this.hero, alpha: 0, angle: 90, duration: 500 / store().speed });
      await this.wait(900);
    } else {
      await this.wait(300);
    }
    this.cameras.main.setVisible(false);
    this.tweens.killTweensOf([this.enemy, this.hero]);
    this.enemy.setAlpha(1);
    this.hero.setAlpha(1).setAngle(0);
    this.active = false;
  }
}
