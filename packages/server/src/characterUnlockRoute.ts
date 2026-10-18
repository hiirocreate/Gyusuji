import http from 'node:http';
import { CHARS } from '@gyusuji/shared';
import { verifyCharacterUnlockCode } from './characterUnlockCodes.js';

class RequestTooLargeError extends Error {}

function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const maxBytes = 1024;
    const contentLength = Number(req.headers['content-length'] ?? 0);
    let tooLarge = Number.isFinite(contentLength) && contentLength > maxBytes;
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (raw: Buffer | string) => {
      if (tooLarge) return;
      const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
      size += chunk.length;
      if (size > maxBytes) {
        tooLarge = true;
        chunks.length = 0;
      } else {
        chunks.push(chunk);
      }
    });
    req.on('end', () => {
      if (tooLarge) {
        reject(new RequestTooLargeError());
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown);
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function json(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

export async function handleCharacterUnlockRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  verifyCode: (input: unknown) => number | null = verifyCharacterUnlockCode,
): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.method !== 'POST') {
    json(res, 405, { error: 'method not allowed' });
    return;
  }
  if (!String(req.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) {
    json(res, 415, { error: 'invalid request' });
    return;
  }

  res.setHeader('Cache-Control', 'no-store');
  try {
    const body = await readJsonBody(req);
    const code = body && typeof body === 'object' ? (body as { code?: unknown }).code : undefined;
    const characterId = verifyCode(code);
    const character = characterId === null ? undefined : CHARS[characterId];
    if (!character?.unlock) {
      json(res, 404, { error: 'invalid code' });
      return;
    }
    json(res, 200, { characterId: character.id });
  } catch (error) {
    json(res, error instanceof RequestTooLargeError ? 413 : 400, { error: 'invalid request' });
  }
}
