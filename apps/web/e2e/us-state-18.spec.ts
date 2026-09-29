// US-STATE-18 · The event stream reconnects on its own with backoff (1 s, 2 s, 4 s … ±20%). Playwright refuses the
// dev gallery's stream a few times, as if hlabs were briefly unreachable, then lets it through.
import { expect, test } from '@playwright/test';

test('US-STATE-18 the stream retries after about 1, 2 and 4 s, then connects and events flow again', async ({
  page,
  request,
}) => {
  const attempts: number[] = [];
  await page.route(
    (url) => url.pathname === '/trpc/events.stream' && !url.searchParams.get('input')?.includes('types'),
    async (route) => {
      attempts.push(Date.now());
      if (attempts.length <= 3) return route.abort('connectionrefused');
      return route.continue();
    },
  );
  await page.goto('/dev/ui');
  await expect(page.getByTestId('stream-status')).toHaveText('Connected', { timeout: 15_000 });

  const gaps = attempts.slice(1, 4).map((t, i) => t - attempts[i]!);
  for (const [gap, base] of gaps.map((g, i) => [g, [1_000, 2_000, 4_000][i]!] as const)) {
    expect(gap).toBeGreaterThanOrEqual(base * 0.8 - 50);
    expect(gap).toBeLessThanOrEqual(base * 1.2 + 500);
  }

  const message = `after reconnect ${Date.now()}`;
  await request.post('/dev/emit-test-event', { data: { message } });
  await expect(page.getByTestId('last-event')).toContainText(message);
});
