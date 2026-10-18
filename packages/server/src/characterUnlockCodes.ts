import { createHash, timingSafeEqual } from 'node:crypto';

// 生コードはこのファイルや公開クライアントに置かず、管理者専用の別保管物とする。
// 各コードはランダムな130-bit値で、ここにはSHA-256ハッシュのみを保持する。
const CODE_HASH_TO_CHARACTER_ID = new Map<string, number>([
  ['c6adc8e1ce17dd31291253bc382264d0d6c605a4466eb72abf9c2de3bb7c7ac3', 5],
  ['8f75e81834dbd16fe4033e65d8019b0857536261b93e5b879f193c0fccf88997', 6],
  ['0b3f90bcf6b007db9da78cecdc97e3db5fe00d690719dba4b69a9e1ffa858550', 7],
]);

export function normalizeCharacterUnlockCode(input: unknown): string | null {
  if (typeof input !== 'string' || input.length > 96) return null;
  const normalized = input.trim().toUpperCase().replace(/[\s-]+/g, '');
  return /^[A-Z0-9]{32,40}$/.test(normalized) ? normalized : null;
}

export function createCharacterUnlockVerifier(codeHashes: ReadonlyMap<string, number>) {
  const entries = [...codeHashes.entries()]
    .filter(([hash, id]) => /^[a-f0-9]{64}$/i.test(hash) && Number.isInteger(id))
    .map(([hash, id]) => [Buffer.from(hash, 'hex'), id] as const);

  return (input: unknown): number | null => {
    const normalized = normalizeCharacterUnlockCode(input);
    if (!normalized) return null;

    const digest = createHash('sha256').update(normalized, 'ascii').digest();
    let matchedId: number | null = null;
    for (const [expected, id] of entries) {
      if (timingSafeEqual(digest, expected)) matchedId = id;
    }
    return matchedId;
  };
}

const verify = createCharacterUnlockVerifier(CODE_HASH_TO_CHARACTER_ID);

export function verifyCharacterUnlockCode(input: unknown): number | null {
  return verify(input);
}
