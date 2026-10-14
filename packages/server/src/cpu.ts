import { cpuDecide, Rand } from '@gyusuji/shared';
import type { Ask, Game, GameEvent, Input } from '@gyusuji/shared';

export { cpuDecide };

/** CPU の思考。サーバ乱数とは別系統 */
export function makeCpu(seed: number) {
  const rand = new Rand(seed ^ 0x9e3779b9);
  return (g: Game, ask: Ask): Input => cpuDecide(g, ask, rand);
}

/** クライアントの演出時間の目安（ms, 1倍速）。CPU と制限時間のペース配分に使う */
export function animMs(events: GameEvent[]): number {
  let t = 0;
  for (const e of events) {
    switch (e.t) {
      case 'dice': t += 2600; break;
      case 'move': t += e.cells.length * 210 + 100; break;
      case 'battleStart': t += 2600; break;
      case 'battleHit': t += 700; break;
      case 'msg': t += 500; break;
      case 'paru': t += e.kiwami ? 2500 : 1200; break;
      case 'fx': case 'swap': case 'warp': case 'respawn': t += 600; break;
      default: t += 50;
    }
  }
  return Math.min(t, 30000);
}
