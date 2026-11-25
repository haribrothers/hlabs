// US-APP-29 · See who visits a public app: Visits (time, address and country, page, result, newest first, filtered by
// result), the addresses refused right now, opened from Access, Settings › Network or the attack notification, and
// never for members.
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { currentToasts, dismissToast } from '../lib/toasts';
import { fakeMe } from '../test/me';
import { appPublic, publicOptions } from '../test/public';
import { renderScreen, type Handlers } from '../test/render';
import { appDetail } from '../test/store';
import { appOverlay, overlayForPath } from './app-overlay';
import { AppAccess } from './app-access';
import { AppPublicVisits, visitTime } from './app-public-visits';
import { AppSettings } from './app-settings';

const never = () => new Promise(() => {});
const NOW = Date.now();
const MIN = 60_000;
const immich = (over: Parameters<typeof appDetail>[0] = {}) =>
  appDetail({ id: 'immich', name: 'Immich', state: 'running', public: appPublic(), ...over });

const visit = (over: Record<string, unknown>) => ({
  at: NOW - MIN,
  ip: '203.0.113.24',
  country: 'NL',
  method: 'POST',
  path: '/.hlabs/sign-in',
  status: 401,
  result: 'tooManyTries',
  ...over,
});

const ITEMS = [
  visit({}),
  visit({ at: NOW - 2 * MIN, result: 'refused', status: 403 }),
  visit({
    at: NOW - 60 * MIN,
    ip: '198.51.100.7',
    country: 'IN',
    path: '/share/7Hq2',
    result: 'signedIn',
    status: 200,
  }),
  visit({ at: NOW - 61 * MIN, ip: '198.51.100.7', country: null, path: '/', result: 'askedToSignIn', status: 302 }),
];

afterEach(() => {
  for (const t of currentToasts()) dismissToast(t.id);
});

function visits(handlers: Handlers = {}) {
  return renderScreen(() => <AppPublicVisits app={immich()} onBack={() => undefined} />, {
    'apps.publicVisits': (input) => {
      const { result } = input as { result?: string };
      return {
        items: ITEMS.filter((v) => !result || v.result === result),
        nextCursor: null,
        refused: [{ ip: '203.0.113.24', until: NOW + 60 * MIN, failures: 23 }],
      };
    },
    'events.stream': never,
    ...handlers,
  });
}

describe('US-APP-29', () => {
  it('Visits: the requests to its address in the last 7 days, newest first, with address, country, page and result', async () => {
    visits();
    expect(await screen.findByRole('heading', { name: 'Visits to Immich' })).toBeInTheDocument();
    expect(screen.getByText('https://photos.example.com')).toBeInTheDocument();
    expect(screen.getByText(/in the last 7 days\. Kept for 7 days, never in backups\./)).toBeInTheDocument();
    const table = await screen.findByRole('table', { name: 'Visits' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(4);
    expect(within(rows[0]!).getByText('203.0.113.24')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('Netherlands')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('Too many tries')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('Refused')).toBeInTheDocument();
    expect(within(rows[2]!).getByText('/share/7Hq2')).toBeInTheDocument();
    expect(within(rows[2]!).getByText('India')).toBeInTheDocument();
    expect(within(rows[2]!).getByText('Signed in')).toBeInTheDocument();
    expect(within(rows[3]!).getByText('Asked to sign in')).toBeInTheDocument();
    expect(within(rows[0]!).getByText(/^Today /)).toBeInTheDocument();
  });

  it('filters by result', async () => {
    const { calls } = visits();
    await screen.findByRole('table', { name: 'Visits' });
    const show = screen.getByRole('group', { name: 'Show' });
    expect(within(show).getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(within(show).getByRole('button', { name: 'Signed in' }));
    await waitFor(() =>
      expect(calls.filter((c) => c.path === 'apps.publicVisits').at(-1)?.input).toMatchObject({
        appId: 'immich',
        result: 'signedIn',
      }),
    );
    await waitFor(() => expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(2));
    expect(within(show).getByRole('button', { name: 'Signed in' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('an address refused after too many tries says until when, how many, and what to do', async () => {
    visits();
    const refused = await screen.findByText(/^203\.0\.113\.24 is refused until /);
    expect(refused.closest('[role="status"]')).toHaveTextContent(
      "It got the password wrong 23 times in 10 minutes. If you don't know who that is, make Immich private.",
    );
    expect(screen.getByRole('button', { name: 'Make private' })).toBeInTheDocument();
  });

  it('nothing yet: says so', async () => {
    visits({ 'apps.publicVisits': () => ({ items: [], nextCursor: null, refused: [] }) });
    expect(await screen.findByText('No visits in the last 7 days.')).toBeInTheDocument();
  });

  it('App settings opened at Visits (from Settings › Network or the notification) shows them, and Back returns', async () => {
    const app = immich();
    renderScreen(() => <AppSettings appId="immich" initialView="visits" />, {
      'apps.get': () => app,
      'apps.publicVisits': () => ({ items: [], nextCursor: null, refused: [] }),
      'auth.me': fakeMe({ role: 'admin' }),
      'events.stream': never,
    });
    expect(await screen.findByRole('heading', { name: 'Visits to Immich' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to Immich' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Immich' })).toBeInTheDocument();
  });

  it('the Visits button in Access opens them', async () => {
    let opened = false;
    renderScreen(
      () => (
        <AppAccess
          app={immich()}
          shippedPhase={7}
          onOpenVisits={() => {
            opened = true;
          }}
        />
      ),
      {
        'apps.publicOptions': () => publicOptions({ current: appPublic() }),
        'events.stream': never,
      },
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Visits' }));
    expect(opened).toBe(true);
  });

  it("the notification's link opens App settings at Visits", () => {
    expect(overlayForPath('/apps/immich/settings?view=visits')).toEqual({ settings: 'immich', view: 'visits' });
    expect(appOverlay({ settings: 'immich', view: 'visits' })).toEqual({ settings: 'immich', view: 'visits' });
    expect(appOverlay({ settings: 'immich', view: 'other' })).toEqual({ settings: 'immich' });
  });

  it('members never see Visits', async () => {
    renderScreen(() => <AppSettings appId="immich" initialView="visits" />, {
      'apps.get': () => immich(),
      'auth.me': fakeMe({ role: 'member' }),
      'events.stream': never,
    });
    expect(await screen.findByText("You don't have access to this")).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Visits to Immich' })).toBeNull();
  });

  it('times read Today, Yesterday or the date', () => {
    const noon = new Date(2026, 11, 3, 12, 0).getTime();
    expect(visitTime(noon - 30 * MIN, noon)).toMatch(/^Today /);
    expect(visitTime(noon - 86_400_000, noon)).toMatch(/^Yesterday /);
    expect(visitTime(noon - 3 * 86_400_000, noon)).toMatch(/(30 Nov|Nov 30)/);
  });
});
