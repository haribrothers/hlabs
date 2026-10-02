// US-INST-16 · Recover from a missing or mismatched tray token: the daemon's side. The tray's repair (regenerate,
// restart once, give up) is tested in apps/tray (access.rs, us-inst-16.test.tsx).
import { Writable } from 'node:stream';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { newTrayToken, TrayTokens, type TrayTokenSource } from '../src/auth/tray-token';
import { LOG_REDACT } from '../src/logger';

describe('US-INST-16 · Recover from a missing or mismatched tray token', () => {
  it('never logs the token: the Authorization header is redacted', () => {
    const token = newTrayToken();
    let out = '';
    const sink = new Writable({
      write(chunk, _enc, done) {
        out += String(chunk);
        done();
      },
    });
    const log = pino({ redact: LOG_REDACT }, sink);
    log.info({ req: { headers: { authorization: `Bearer ${token}`, host: '127.0.0.1' } } }, 'request');
    expect(out).not.toContain(token);
    expect(out).toContain('[redacted]');
  });

  it('a token the tray regenerated after a missing keychain item works without restarting the daemon (D-112)', async () => {
    let now = 0;
    let stored: string | null = null;
    const source: TrayTokenSource = { read: async () => stored };
    const tokens = new TrayTokens(source, () => now);
    await tokens.load();
    const token = newTrayToken();
    stored = token;
    now = 5_000;
    expect(await tokens.verify(token)).toBe(true);
  });
});
