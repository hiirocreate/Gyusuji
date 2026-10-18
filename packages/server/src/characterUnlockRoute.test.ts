import http from 'node:http';
import { createHash } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createCharacterUnlockVerifier } from './characterUnlockCodes.js';
import { handleCharacterUnlockRequest } from './characterUnlockRoute.js';

const testCode = `BH-TEST-${'A'.repeat(26)}`;
const normalizedTestCode = testCode.replace(/[\s-]+/g, '').toUpperCase();
const testHash = createHash('sha256').update(normalizedTestCode, 'ascii').digest('hex');
const verifyTestCode = createCharacterUnlockVerifier(new Map([[testHash, 7]]));

let server: http.Server;
let port = 0;

function request(method: string, body = '', headers: Record<string, string> = {}) {
  return new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }>((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path: '/character-unlock', method, headers }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => { text += chunk; });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: text }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

describe('character unlock HTTP route', () => {
  beforeAll(async () => {
    server = http.createServer((req, res) => { void handleCharacterUnlockRequest(req, res, verifyTestCode); });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const address = server.address() as AddressInfo;
        port = address.port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  it('responds to CORS preflight without requiring a request body', async () => {
    const response = await request('OPTIONS', '', {
      Origin: 'https://gyusuji.example',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type',
    });
    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('*');
    expect(response.headers['access-control-allow-methods']).toContain('POST');
  });

  it('returns only the assigned locked character for a valid code', async () => {
    const response = await request('POST', JSON.stringify({ code: testCode }), { 'Content-Type': 'application/json' });
    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ characterId: 7 });
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('rejects invalid codes, wrong methods, and non-JSON bodies', async () => {
    const invalid = await request('POST', JSON.stringify({ code: `${testCode}B` }), { 'Content-Type': 'application/json' });
    expect(invalid.status).toBe(404);
    expect(JSON.parse(invalid.body)).toEqual({ error: 'invalid code' });
    expect((await request('GET')).status).toBe(405);
    expect((await request('POST', '{}', { 'Content-Type': 'text/plain' })).status).toBe(415);
  });

  it('rejects malformed and oversized request bodies', async () => {
    expect((await request('POST', '{', { 'Content-Type': 'application/json' })).status).toBe(400);
    expect((await request('POST', 'x'.repeat(2048), { 'Content-Type': 'application/json' })).status).toBe(413);
  });
});
