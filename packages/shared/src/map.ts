import type { Dir, MapData, PathCell } from './types.js';
import { ENEMIES } from './data/enemies.js';

export const DIRS: Record<Dir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
export const OPP: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' };
const BOSS_CELLS = ['boss1', 'boss2', 'boss3', 'lastboss'];

export const key = (x: number, y: number) => `${x},${y}`;

export class GameMap {
  readonly cells = new Map<string, PathCell>();
  /** 停止マス → そのマスで発動するオブジェクト index 一覧 */
  readonly triggers = new Map<string, number[]>();
  /** ボス制御マス → ボスオブジェクト index */
  readonly bossOf = new Map<string, number>();
  readonly start: PathCell;
  readonly startDir: Dir;

  constructor(readonly data: MapData) {
    for (const p of data.path) this.cells.set(key(p.x, p.y), p);
    data.objects.forEach((o, i) => {
      if (o.type === 'decor' || ENEMIES[o.type]?.boss) return;
      const tx = o.dir ? o.x + DIRS[o.dir][0] : o.x;
      const ty = o.dir ? o.y + DIRS[o.dir][1] : o.y;
      const k = key(tx, ty);
      if (!this.cells.has(k)) return;
      if (!this.triggers.has(k)) this.triggers.set(k, []);
      this.triggers.get(k)!.push(i);
    });
    for (const p of data.path) {
      if (!BOSS_CELLS.includes(p.c)) continue;
      const want = p.c === 'lastboss' ? 'last' : 'mid';
      for (const d of Object.keys(DIRS) as Dir[]) {
        const nx = p.x + DIRS[d][0];
        const ny = p.y + DIRS[d][1];
        const idx = data.objects.findIndex((o) => o.x === nx && o.y === ny && ENEMIES[o.type]?.boss === want);
        if (idx >= 0) {
          this.bossOf.set(key(p.x, p.y), idx);
          break;
        }
      }
    }
    this.start = data.path.find((p) => p.c === 'start')!;
    this.startDir = this.exits(this.start.x, this.start.y, null)[0] ?? 'up';
  }

  cell(x: number, y: number): PathCell | undefined {
    return this.cells.get(key(x, y));
  }

  /** 道として進める方向（戻る方向は除く） */
  exits(x: number, y: number, from: Dir | null): Dir[] {
    return (Object.keys(DIRS) as Dir[]).filter(
      (d) => (from === null || d !== OPP[from]) && this.cells.has(key(x + DIRS[d][0], y + DIRS[d][1])),
    );
  }

  /** 分岐マスの選択肢。[楽な道, 険しい道] の順 */
  branchOptions(x: number, y: number, dir: Dir): { dir: Dir; easy: boolean }[] {
    const ex = this.exits(x, y, dir);
    const zoned = ex.map((d) => ({ d, z: this.cell(x + DIRS[d][0], y + DIRS[d][1])?.zone }));
    if (zoned.some((e) => e.z === 'easy' || e.z === 'hard')) {
      return zoned.map((e) => ({ dir: e.d, easy: e.z !== 'hard' })).sort((a, b) => Number(b.easy) - Number(a.easy));
    }
    // ゾーン情報が無いマップは右=楽な道、左=険しい道
    const order: Dir[] = ['right', 'down', 'up', 'left'];
    return ex.sort((a, b) => order.indexOf(a) - order.indexOf(b)).map((d, i) => ({ dir: d, easy: i === 0 }));
  }

  /** 制御マスに従った次の進行方向（分岐は null） */
  nextDir(x: number, y: number, dir: Dir): Dir | null {
    const c = this.cell(x, y)?.c;
    if (c === 'up' || c === 'down' || c === 'left' || c === 'right') return c;
    if (c === 'branch') return null;
    if (c === 'start') return this.startDir;
    return this.exits(x, y, dir).includes(dir) ? dir : (this.exits(x, y, dir)[0] ?? dir);
  }

  isBossCell(x: number, y: number): boolean {
    return BOSS_CELLS.includes(this.cell(x, y)?.c ?? '');
  }
}
