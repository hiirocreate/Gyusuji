import http from 'node:http';
import { Server, matchMaker } from 'colyseus';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { GameRoom } from './GameRoom.js';
import { friendRooms } from './registry.js';

const port = Number(process.env.PORT ?? 2567);

const httpServer = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const url = new URL(req.url ?? '/', 'http://x');
  const json = (code: number, body: unknown) => {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  if (url.pathname === '/health') return json(200, { ok: true });
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
  // 観戦可能なルーム一覧
  if (url.pathname === '/rooms') {
    const rooms = await matchMaker.query({ name: 'game' });
    return json(200, rooms.filter((r) => r.metadata?.phase === 'playing').map((r) => ({ roomId: r.roomId, code: r.metadata?.code, clients: r.clients })));
  }
  res.writeHead(404);
  res.end();
});

const gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer }) });
gameServer.define('game', GameRoom).filterBy(['public']);
gameServer.listen(port).then(() => console.log(`BEEF HUNTER server listening on :${port}`));
