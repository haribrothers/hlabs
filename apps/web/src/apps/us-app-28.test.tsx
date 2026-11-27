// US-APP-28 · Choose who gets into a public app, in AppPublic: the hlabs login (chosen) with who has two-factor and
// who can't get in yet; "<App>'s own login only" only when the manifest says it's safe, with its warning and "I
// understand"; "Require hlabs login" stays on while public with it; a public sign-in in the sessions list. The pages
// on the public address are in src/shell/us-app-28.test.tsx.
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { currentToasts, dismissToast } from '../lib/toasts';
import { fakeMe } from '../test/me';
import { appPublic, job, person, publicOptions } from '../test/public';
import { renderScreen, type Handlers } from '../test/render';
import { appDetail } from '../test/store';
import { SignedInDevices } from '../settings/signed-in-devices';
import { AppAccess } from './app-access';

const never = () => new Promise(() => {});
const immich = (over: Parameters<typeof appDetail>[0] = {}) =>
  appDetail({ id: 'immich', name: 'Immich', state: 'running', ...over });

afterEach(() => {
  for (const t of currentToasts()) dismissToast(t.id);
});

function access(app = immich(), handlers: Handlers = {}) {
  return renderScreen(() => <AppAccess app={app} shippedPhase={7} />, {
    'apps.get': () => app,
    'apps.publicOptions': () => publicOptions(),
    'apps.setPublic': () => ({ jobId: 'job1' }),
    'jobs.get': () => job({ id: 'job1' }),
    'auth.me': fakeMe({ role: 'admin' }),
    'events.stream': never,
    ...handlers,
  });
}

async function dialog(handlers: Handlers = {}, app = immich()) {
  const r = access(app, handlers);
  fireEvent.click(await screen.findByRole('button', { name: 'Make public…' }));
  return { ...r, dialog: await screen.findByRole('dialog', { name: 'Make Immich public' }) };
}

describe('US-APP-28', () => {
  it('"Who can get in": the hlabs login, chosen; no own-login option unless the manifest says it\'s safe', async () => {
    const { dialog: d } = await dialog();
    const who = within(d).getByRole('radiogroup', { name: 'Who can get in' });
    const hlabs = within(who).getByRole('radio', { name: /People with an hlabs account and access to Immich/ });
    expect(hlabs).toHaveAttribute('aria-checked', 'true');
    expect(within(hlabs).getByText('They sign in to hlabs first, with two-factor.')).toBeInTheDocument();
    expect(within(who).getAllByRole('radio')).toHaveLength(1);
  });

  it("lists who is allowed in and who can't get in yet without two-factor", async () => {
    const { dialog: d } = await dialog();
    const people = within(d).getByRole('list', { name: 'Who can get in' });
    const row = (name: string) => within(people).getByText(name).closest('li') as HTMLElement;
    expect(within(row('Hari')).getByText('Two-factor on')).toBeInTheDocument();
    expect(within(row('Asha')).getByText('Two-factor on')).toBeInTheDocument();
    expect(within(row('Ravi')).getByText("Can't get in yet")).toBeInTheDocument();
    expect(
      within(d).getByText("Ravi hasn't turned on two-factor login yet, so can't get in until then."),
    ).toBeInTheDocument();
  });

  it("when nobody allowed in has two-factor, nobody could get in, so it can't be made public that way", async () => {
    const { dialog: d } = await dialog({
      'apps.publicOptions': () => publicOptions({ people: [person('u1', 'Hari', false)] }),
    });
    expect(within(d).getByText(/Nobody with access has two-factor login on yet/)).toBeInTheDocument();
    expect(within(d).getByRole('button', { name: 'Make public' })).toBeDisabled();
  });

  it('"<App>\'s own login only" warns who can reach its sign-in page and needs "I understand"', async () => {
    const { dialog: d, calls } = await dialog({ 'apps.publicOptions': () => publicOptions({ ownLoginSafe: true }) });
    const own = within(d).getByRole('radio', { name: /Immich's own login only/ });
    expect(
      within(own).getByText("Its phone and desktop apps connect. hlabs doesn't ask for a login."),
    ).toBeInTheDocument();
    fireEvent.click(own);
    expect(own).toHaveAttribute('aria-checked', 'true');
    expect(
      within(d).getByText(
        "Anyone on the internet can reach Immich's sign-in page. Use a strong password for every Immich account.",
      ),
    ).toBeInTheDocument();
    // The login note and the people are for the hlabs login only.
    expect(within(d).queryByText(/hlabs asks for a login first/)).toBeNull();
    expect(within(d).queryByRole('list', { name: 'Who can get in' })).toBeNull();
    const make = within(d).getByRole('button', { name: 'Make public' });
    expect(make).toBeDisabled();
    fireEvent.click(within(d).getByRole('checkbox', { name: 'I understand' }));
    expect(make).toBeEnabled();
    fireEvent.click(make);
    await waitFor(() =>
      expect(calls.find((c) => c.path === 'apps.setPublic')?.input).toEqual({
        appId: 'immich',
        public: true,
        hostname: 'immich',
        access: 'ownLogin',
        understood: true,
      }),
    );
  });

  it('changing the login of a public app is Save, starting from what it has now', async () => {
    const current = appPublic({ access: 'ownLogin' });
    const { calls } = access(immich({ public: current }), {
      'apps.publicOptions': () => publicOptions({ ownLoginSafe: true, current }),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Change…' }));
    const d = await screen.findByRole('dialog', { name: "Change Immich's public address" });
    expect(within(d).getByRole('textbox')).toHaveValue('photos');
    const save = within(d).getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    fireEvent.click(within(d).getByRole('radio', { name: /People with an hlabs account/ }));
    fireEvent.click(save);
    await waitFor(() =>
      expect(calls.find((c) => c.path === 'apps.setPublic')?.input).toEqual({
        appId: 'immich',
        public: true,
        hostname: 'photos',
        access: 'hlabs',
      }),
    );
    await waitFor(() =>
      expect(currentToasts().some((t) => t.title === "Immich's public address is changed")).toBe(true),
    );
  });

  it('"Require hlabs login" stays on while the app is public with it', async () => {
    access(immich({ public: appPublic(), authMode: 'hlabs' }), {
      'apps.publicOptions': () => publicOptions({ current: appPublic() }),
    });
    const toggle = await screen.findByRole('switch', { name: 'Require hlabs login' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(toggle).toBeDisabled();
    expect(screen.getByText('On while Immich is public with the hlabs login')).toBeInTheDocument();
  });

  it("a sign-in on a public address is listed with the person's sessions, naming the address", async () => {
    const now = Date.now();
    renderScreen(() => <SignedInDevices />, {
      'auth.listSessions': () => ({
        items: [
          {
            id: 's1',
            current: true,
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15',
            ip: '127.0.0.1',
            createdAt: now,
            lastSeenAt: now,
            publicHost: null,
          },
          {
            id: 's2',
            current: false,
            userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1',
            ip: '203.0.113.9',
            createdAt: now,
            lastSeenAt: now,
            publicHost: 'photos.example.com',
          },
        ],
      }),
      'events.stream': never,
    });
    expect(await screen.findByText(/^Public app at photos\.example\.com · /)).toBeInTheDocument();
  });
});
