import Phaser from 'phaser';
import { classicTile, v2Tile } from '../assets.js';

const TILE = 40;
const PREFIX = 'classic/';

/** 見た目だけの派生テクスチャ。マップ番号・経路・イベントは変更しない。 */
export function terrainTexture(t: number, v2: boolean, x = 0, y = 0): string {
  const original = v2 ? v2Tile(t) : classicTile(t);
  if (original === 'sea') return 'sea';
  const kind = original.slice('tiles/'.length);
  return `${PREFIX}${kind}_${((x * 3 + y * 5) % 4 + 4) % 4}`;
}

export function pathTexture(control: string, onSea = false): string {
  const kind = control === 'start' ? 'path_start' : control === 'branch' ? 'path_branch'
    : control === 'lastboss' ? 'path_lastboss' : /^boss/.test(control) ? 'path_boss'
    : onSea ? 'bridge' : 'path';
  return `${PREFIX}${kind}`;
}

/** 起動時に一度だけ作り、タイトルとフィールドで同じ見た目を使う。 */
export function makeClassicTerrain(scene: Phaser.Scene): string[] {
  const keys: string[] = [];
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const save = (key: string) => {
    g.generateTexture(key, TILE, TILE);
    keys.push(key);
    g.clear();
  };
  const grass = (variant: number) => {
    g.fillStyle(0x78a61b).fillRect(0, 0, TILE, TILE);
    // 小さな低コントラストの粒。三角の草模様を繰り返さない。
    let seed = 61 + variant * 137;
    for (let i = 0; i < 150; i++) {
      seed = (seed * 16807) % 2147483647;
      const x = seed % TILE;
      seed = (seed * 16807) % 2147483647;
      const y = seed % TILE;
      g.fillStyle(i % 2 ? 0x6c9915 : 0x8ab52c, 0.5).fillRect(x, y, 1, 1);
    }
  };
  const peak = (x: number, y: number, size: number) => {
    g.fillStyle(0x4b6614, 0.25).fillEllipse(x, y + 1, size * 1.3, size * 0.38);
    g.fillStyle(0xc7a45d).fillTriangle(x - size / 2, y, x - 1, y - size, x + size / 2, y);
    g.fillStyle(0xe0ca8a).fillTriangle(x - size / 2, y, x - 1, y - size, x + 1, y - size * 0.35);
    g.fillStyle(0x9c813e).fillTriangle(x + 1, y - size * 0.35, x - 1, y - size, x + size / 2, y);
    g.fillStyle(0xf0dfab).fillTriangle(x - size * 0.2, y - size * 0.68, x - 1, y - size, x + size * 0.15, y - size * 0.65);
  };
  for (let variant = 0; variant < 4; variant++) {
    grass(variant);
    save(`${PREFIX}grass_${variant}`);
    grass(variant);
    // 低い山をひとまとまりにして、草地との境界を穏やかにする。
    peak(17, 23, 16);
    peak(29, 29, 15);
    peak(9, 32, 14);
    peak(20, 36, 17);
    save(`${PREFIX}mountain_${variant}`);
    // 森には同梱オリジナルの木を再利用する。
    const forest = scene.textures.get('tiles/forest').getSourceImage() as HTMLImageElement;
    const oldGrass = scene.textures.get('tiles/grass').getSourceImage() as HTMLImageElement;
    const ft = scene.textures.createCanvas(`${PREFIX}forest_${variant}`, TILE, TILE)!;
    const base = scene.textures.get(`${PREFIX}grass_${variant}`).getSourceImage() as HTMLCanvasElement;
    const ctx = ft.getContext();
    ctx.drawImage(oldGrass, 0, 0);
    const original = ctx.getImageData(0, 0, TILE, TILE);
    ctx.drawImage(base, 0, 0);
    const ground = ctx.getImageData(0, 0, TILE, TILE);
    ctx.drawImage(forest, 0, 0);
    const pixels = ctx.getImageData(0, 0, TILE, TILE);
    // forest は同梱grassに木を合成した画像。同一の背景ピクセルだけ置換する。
    for (let i = 0; i < pixels.data.length; i += 4) {
      if (pixels.data[i] !== original.data[i] || pixels.data[i + 1] !== original.data[i + 1]
        || pixels.data[i + 2] !== original.data[i + 2] || pixels.data[i + 3] !== original.data[i + 3]) continue;
      pixels.data.set(ground.data.subarray(i, i + 4), i);
    }
    ctx.putImageData(pixels, 0, 0);
    ft.refresh();
    keys.push(`${PREFIX}forest_${variant}`);
    g.fillStyle(0xdbcc8f).fillRect(0, 0, TILE, TILE);
    for (let i = 0; i < 48; i++) {
      g.fillStyle(i % 2 ? 0xcbb976 : 0xece0af, 0.5).fillRect((i * 17 + variant * 3) % TILE, (i * 11 + variant * 7) % TILE, 1, 1);
    }
    save(`${PREFIX}sand_${variant}`);
  }
  for (let phase = 0; phase < 2; phase++) {
    g.fillStyle(0x095bc7).fillRect(0, 0, TILE, TILE);
    g.lineStyle(1, 0x319de4, 0.6);
    for (let y = 3; y < TILE; y += 8) {
      for (let x = -8; x < TILE + 8; x += 16) {
        const dx = x + (y % 16 ? 5 : 0) + phase * 3;
        g.beginPath().moveTo(dx, y + 1).lineTo(dx + 3, y).lineTo(dx + 6, y + 1).strokePath();
      }
    }
    save(`${PREFIX}sea_${phase}`);
  }
  for (const kind of ['path', 'path_start', 'path_branch', 'path_boss', 'path_lastboss']) {
    g.fillStyle(0x526a15, 0.3).fillRoundedRect(4, 5, 33, 32, 6);
    g.fillStyle(0xf2cb58).fillRoundedRect(3, 3, 34, 33, 6);
    g.fillStyle(0xffffdc).fillRoundedRect(5, 5, 30, 29, 4);
    if (kind === 'path') {
      g.lineStyle(1, 0x78d5c9).strokeRect(17, 14, 6, 7);
      g.fillStyle(0xc6f1dd).fillRect(19, 16, 2, 3);
    } else if (kind === 'path_branch') {
      g.fillStyle(0xe47749).fillTriangle(12, 21, 18, 15, 18, 27);
      g.fillTriangle(28, 21, 22, 15, 22, 27);
    } else if (kind === 'path_start') {
      g.lineStyle(2, 0x82c3bc).strokeRect(14, 12, 12, 13);
      g.fillStyle(0x82c3bc).fillRect(18, 16, 4, 5);
    } else {
      const color = kind === 'path_lastboss' ? 0x8269b5 : 0xc7813e;
      g.fillStyle(color).fillTriangle(20, 11, 13, 20, 20, 29).fillTriangle(20, 11, 27, 20, 20, 29);
      g.fillStyle(0xffef99).fillRect(19, 16, 2, 8);
    }
    save(`${PREFIX}${kind}`);
  }
  // 海のマスだけは同梱の木橋を使う。
  const bridge = scene.textures.createCanvas(`${PREFIX}bridge`, TILE, TILE)!;
  bridge.getContext().drawImage(scene.textures.get('tiles/bridge').getSourceImage() as HTMLImageElement, 0, 0);
  bridge.refresh();
  keys.push(`${PREFIX}bridge`);
  g.destroy();
  return keys;
}

/** 水際の細い線も表示専用。地形データや通行可能性には触れない。 */
export function drawShoreline(scene: Phaser.Scene, d: { width: number; height: number; terrain: number[]; terrainSet?: string }): void {
  const v2 = d.terrainSet === 'v2';
  const water = (x: number, y: number) => x < 0 || y < 0 || x >= d.width || y >= d.height
    || (v2 ? d.terrain[y * d.width + x] === 0 : d.terrain[y * d.width + x] === 3);
  const g = scene.add.graphics().setDepth(-1.5).lineStyle(1, 0xc9ce64, 0.8);
  for (let y = 0; y < d.height; y++) {
    for (let x = 0; x < d.width; x++) {
      if (water(x, y)) continue;
      const px = x * TILE;
      const py = y * TILE;
      if (water(x, y - 1)) g.lineBetween(px, py + 0.5, px + TILE, py + 0.5);
      if (water(x, y + 1)) g.lineBetween(px, py + TILE - 0.5, px + TILE, py + TILE - 0.5);
      if (water(x - 1, y)) g.lineBetween(px + 0.5, py, px + 0.5, py + TILE);
      if (water(x + 1, y)) g.lineBetween(px + TILE - 0.5, py, px + TILE - 0.5, py + TILE);
    }
  }
}
