// Helpers for the tablet specs (14-tablet.md): an iPad by touch, in the tablet project (1180 × 820, hasTouch, isMobile).
import { expect, type CDPSession, type Locator, type Page } from '@playwright/test';
import { box } from './phone';

export { box, expectTouchTarget } from './phone';

export const PORTRAIT = { width: 820, height: 1180 } as const;
export const LANDSCAPE = { width: 1180, height: 820 } as const;

export const dock = (page: Page) => page.getByRole('navigation', { name: 'Dock' });

/** The middle of an element. */
export async function centre(locator: Locator) {
  const b = await box(locator);
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

/** A finger on the screen, driven step by step (touch events, as an iPad sends them). */
export class Finger {
  private constructor(
    private readonly page: Page,
    private readonly cdp: CDPSession,
    private at: { x: number; y: number },
  ) {}

  static async down(page: Page, at: { x: number; y: number }) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [at] });
    return new Finger(page, cdp, at);
  }

  /** Slides to `to` in small steps, as a finger does. */
  async move(to: { x: number; y: number }, steps = 8) {
    const from = this.at;
    for (let i = 1; i <= steps; i++) {
      const p = { x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps };
      await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [p] });
      await this.page.waitForTimeout(16);
    }
    this.at = to;
  }

  async hold(ms = 650) {
    await this.page.waitForTimeout(ms);
  }

  async up() {
    await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await this.cdp.detach();
  }
}

/** Holds `locator` for a long press and lifts the finger. */
export async function longPress(page: Page, locator: Locator, ms = 650) {
  const finger = await Finger.down(page, await centre(locator));
  await finger.hold(ms);
  await finger.up();
}

/** Holds `from` for a long press, then drags it onto `to` and lifts the finger there. */
export async function touchDrag(page: Page, from: Locator, to: Locator | { x: number; y: number }) {
  const finger = await Finger.down(page, await centre(from));
  await finger.hold();
  const target = 'x' in to ? to : await centre(to);
  await finger.move(target, 12);
  await finger.hold(150);
  await finger.up();
}

/** The page is in the tablet's touch mode (US-TAB-01). */
export async function expectTouchMode(page: Page) {
  await expect(page.locator('html')).toHaveAttribute('data-input', 'touch');
}

/** tRPC as the signed-in person, from inside the page. */
export async function trpcCall(page: Page, path: string, input?: unknown, mutation = false) {
  return page.evaluate(
    async ({ path, input, mutation }) => {
      const me = (await (await fetch('/trpc/auth.me')).json()) as { result?: { data: { csrfToken: string } } };
      const res = mutation
        ? await fetch(`/trpc/${path}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-hlabs-csrf': me.result?.data.csrfToken ?? '' },
            body: JSON.stringify(input),
          })
        : await fetch(`/trpc/${path}${input ? `?input=${encodeURIComponent(JSON.stringify(input))}` : ''}`);
      return (await res.json()) as { result?: { data: unknown }; error?: unknown };
    },
    { path, input, mutation },
  );
}
