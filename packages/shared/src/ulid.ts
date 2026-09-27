// ULIDs for every id in hlabs (docs/prd/04-data-model.md). Works in Node and the browser.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const TIME_LEN = 10;
const RANDOM_LEN = 16;

export const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;

function encodeTime(ms: number): string {
  if (!Number.isInteger(ms) || ms < 0 || ms > 2 ** 48 - 1) throw new RangeError(`Invalid ULID time: ${ms}`);
  let out = '';
  for (let i = 0; i < TIME_LEN; i++) {
    out = ALPHABET[ms % 32] + out;
    ms = Math.floor(ms / 32);
  }
  return out;
}

function encodeRandom(): string {
  const bytes = new Uint8Array(RANDOM_LEN);
  globalThis.crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += ALPHABET[b % 32];
  return out;
}

/** A new ULID. Lexicographically sortable by creation time. */
export function ulid(now: number = Date.now()): string {
  return encodeTime(now) + encodeRandom();
}

/** The creation time (ms) encoded in a ULID. */
export function ulidTime(id: string): number {
  if (!ULID_PATTERN.test(id)) throw new TypeError(`Not a ULID: ${id}`);
  let ms = 0;
  for (const ch of id.slice(0, TIME_LEN)) ms = ms * 32 + ALPHABET.indexOf(ch);
  return ms;
}
