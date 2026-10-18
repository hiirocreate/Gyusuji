import http from 'node:http';
import { Server, matchMaker } from 'colyseus';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { GameRoom } from './GameRoom.js';
import { friendRooms } from './registry.js';
import { ROOM_SLOTS } from '@gyusuji/shared';
import { handleCharacterUnlockRequest } from './characterUnlockRoute.js';

const port = Number(process.env.PORT ?? 2567);

const httpServer = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  const url = new URL(req.url ?? '/', 'http://x');
  const json = (code: number, body: unknown) => {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  if (url.pathname === '/health') return json(200, { ok: true });
  if (url.pathname === '/character-unlock') return handleCharacterUnlockRequest(req, res);
  // ルームコード → roomId
  if (url.pathname === '/find') {
    const code = (url.searchParams.get('code') ?? '').toUpperCase();
    const rooms = await matchMaker.query({ name: 'game' });
    const r = rooms.find((x) => x.metadata?.code === code);
    return r ? json(200, { roomId: r.roomId, phase: r.metadata?.phase }) : json(404, { error: 'not found' });
  }
  // フレンドコード → roomId
  if (url.pathname === '/friend') {
    const id = friendRooms.get(url.searchParams.get('code') ?? '');
    return id ? json(200, { roomId: id }) : json(404, { error: 'offline' });
  }
  // 部屋選択（8部屋）
  if (url.pathname === '/slots') {
    const rooms = await matchMaker.query({ name: 'game' });
    return json(200, Array.from({ length: ROOM_SLOTS }, (_, i) => {
      const r = rooms.find((x) => x.metadata?.slot === i + 1);
      return { slot: i + 1, players: r?.metadata?.players ?? 0, phase: r?.metadata?.phase ?? 'empty', roomId: r?.roomId ?? null };
    }));
  }
  // 観戦可能なルーム一覧
  if (url.pathname === '/rooms') {
    const rooms = await matchMaker.query({ name: 'game' });
    return json(200, rooms.filter((r) => r.metadata?.phase === 'playing').map((r) => ({ roomId: r.roomId, code: r.metadata?.code, clients: r.clients })));
  }
  res.writeHead(404);
  res.end();
});

const gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer }) });
gameServer.define('game', GameRoom).filterBy(['public', 'slot']);
gameServer.listen(port).then(() => console.log(`BEEF HUNTER server listening on :${port}`));
