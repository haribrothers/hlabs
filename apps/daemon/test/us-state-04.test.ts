// US-STATE-04 · Serve a fallback page when the daemon is down (Caddy's error routes; Caddy itself arrives in phase 2).
import { describe, expect, it } from 'vitest';
import { fallbackErrorRoutes } from '../src/caddy/fallback';

describe('US-STATE-04', () => {
  it('502/503/504 from the daemon: /healthz gets daemon_unreachable, pages get the fallback page, both 503', () => {
    const { routes } = fallbackErrorRoutes('/Applications/hlabs.app/Contents/Resources/web-fallback');
    const [health, page] = routes;
    expect(health!.match[0]).toMatchObject({
      path: ['/healthz'],
      expression: expect.stringContaining('502, 503, 504'),
    });
    expect(health!.handle[0]).toMatchObject({
      handler: 'static_response',
      status_code: 503,
      body: '{"reason":"daemon_unreachable"}',
    });
    expect(page!.handle).toEqual([
      { handler: 'headers', response: { set: { 'Cache-Control': ['no-store'] } } },
      { handler: 'rewrite', uri: '/index.html' },
      { handler: 'file_server', root: '/Applications/hlabs.app/Contents/Resources/web-fallback', status_code: 503 },
    ]);
  });
});
