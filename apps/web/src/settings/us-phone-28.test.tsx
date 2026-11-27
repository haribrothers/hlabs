// US-PHONE-28 · Settings pages on the phone in the new design (D-172, D-174): each is a page you go into, "‹ Settings"
// over its large title, inset grouped lists with icon squares, values at the right of rows and chevrons, and its
// dialogs as sheets — Account's profile centred with Edit in the bar, Appearance's named swatches, Users' ••• sheet
// and Invite as a sheet with a segmented role, Engine's state card, Advanced's rows you tap. What each does is the
// desktop's; the desktop is untouched.
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fakeAccount, twoFactorOn } from '../test/account';
import { renderAdvanced } from '../test/advanced';
import { renderAppearance } from '../test/appearance';
import { fakeMe } from '../test/me';
import { fakeDns } from '../test/network';
import { phoneViewport } from '../test/phone';
import { renderScreen } from '../test/render';
import { SectionPage } from './section-page';

const never = () => new Promise(() => {});
const DAY = 86_400_000;
const NOW = Date.now();

let restore: () => void;
beforeEach(() => {
  restore = phoneViewport();
});
afterEach(() => restore());

/** The page's header: "‹ Settings" and the large title. */
async function expectPage(title: string) {
  expect(await screen.findByRole('heading', { level: 1, name: title })).toHaveClass('hl-p-large');
  expect(screen.getByRole('button', { name: 'Settings' })).toHaveClass('hl-p-back');
}

const user = (o: Record<string, unknown>) => ({
  id: 'x',
  username: 'x',
  displayName: 'X',
  role: 'member',
  avatarColor: null,
  totpEnabled: false,
  lastActiveAt: null,
  disabled: false,
  appCount: 0,
  ...o,
});

function renderUsers() {
  return renderScreen(() => <SectionPage id="users" shippedPhase={3} />, {
    'auth.me': fakeMe(),
    'users.list': () => ({
      users: [
        user({ id: 'u1', username: 'hari', displayName: 'Hari', role: 'admin', lastActiveAt: NOW }),
        user({ id: 'u2', username: 'anu', displayName: 'Anu', appCount: 4, lastActiveAt: NOW - DAY }),
      ],
    }),
    'invites.list': () => ({
      invites: [{ id: 'i1', role: 'member', displayName: null, createdAt: NOW, expiresAt: NOW + 7 * DAY, url: 'u' }],
    }),
    'users.policy.get': () => ({ showUserList: false, requireTwoFactor: false, membersCanInstall: false }),
    'apps.list': () => ({ apps: [] }),
    'invites.create': () => ({ inviteId: 'i2', url: 'https://hlabs.local/invite/abc', homeUrl: null }),
    'invites.revoke': () => ({ ok: true }),
    'events.stream': never,
  });
}

describe('US-PHONE-28', () => {
  it('Account: the profile centred, Edit in the bar, Security rows that are buttons, devices and Log out', async () => {
    renderScreen(() => <SectionPage id="account" />, {
      'auth.me': fakeMe(),
      'account.get': twoFactorOn(2),
      'auth.listSessions': () => ({
        items: [
          {
            id: 's1',
            current: true,
            userAgent: 'Mozilla/5.0 (Macintosh) Chrome/130',
            ip: '127.0.0.1',
            lastSeenAt: NOW,
          },
          {
            id: 's2',
            current: false,
            userAgent: 'Mozilla/5.0 (iPhone) Safari',
            ip: '100.64.0.2',
            lastSeenAt: NOW - DAY,
          },
        ],
      }),
      'events.stream': never,
    });
    await expectPage('Account');
    // "Edit" in the bar, named for what it does.
    const edit = await screen.findByRole('button', { name: 'Edit profile' });
    expect(edit).toHaveTextContent('Edit');
    expect(edit).toHaveClass('hl-p-tbtn');
    fireEvent.click(edit);
    const sheet = await screen.findByRole('dialog', { name: 'Edit profile' });
    expect(sheet.querySelector('.hl-sheet-handle')).not.toBeNull();
    fireEvent.click(within(sheet).getByRole('button', { name: 'Cancel' }));
    // Security: inset rows with icon squares, the value at the right and a chevron.
    const security = screen.getByRole('group', { name: 'Security' });
    const password = within(security).getByRole('button', { name: 'Change password' });
    expect(password).toHaveClass('hl-p-row');
    expect(password.querySelector('.hl-p-sq')).not.toBeNull();
    expect(password.querySelector('.hl-p-chev')).not.toBeNull();
    expect(within(security).getByRole('button', { name: 'Manage two-factor login' })).toHaveTextContent(/On$/);
    expect(within(security).getByRole('button', { name: 'View recovery codes' })).toHaveTextContent('8 of 10 unused');
    // Devices: this one says so; another has Sign out in red at the end.
    const devices = screen.getByRole('group', { name: 'Signed-in devices' });
    expect(within(devices).getByText('This device')).toHaveClass('hl-p-row-value');
    expect(within(devices).getByRole('button', { name: /^Sign out / })).toHaveClass('text-danger');
    expect(screen.getByRole('button', { name: 'Log out' })).toHaveClass('hl-p-row-danger');
  });

  it('Account: two-factor off reads "Off" and turns it on', async () => {
    renderScreen(() => <SectionPage id="account" />, {
      'auth.me': fakeMe(),
      'account.get': fakeAccount(),
      'auth.listSessions': () => ({ items: [] }),
      'events.stream': never,
    });
    const row = await screen.findByRole('button', { name: 'Turn on two-factor login' });
    expect(row).toHaveTextContent(/Off$/);
  });

  it('Appearance: four tall wallpaper tiles with a tick on the chosen one, swatches named under them', async () => {
    renderAppearance({ wallpaper: 'ocean', accent: 'mint' });
    const ocean = await screen.findByRole('button', { name: 'Ocean' });
    expect(ocean).toHaveAttribute('aria-pressed', 'true');
    expect(ocean.querySelector('.hl-wallpick-check')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Dusk' }).querySelector('.hl-wallpick-check')).toBeNull();
    const mint = screen.getByRole('radio', { name: 'Mint' });
    expect(mint).toHaveAttribute('aria-checked', 'true');
    expect(mint.querySelector('.hl-swatch-name')).toHaveTextContent('Mint');
  });

  it('Users: one inset list with roles and •••, the person-plus in the bar and Invite someone at the end', async () => {
    renderUsers();
    await expectPage('Users');
    const people = await screen.findByRole('group', { name: 'People · 3' });
    expect(people.querySelectorAll('.hl-p-row')).toHaveLength(4);
    // My own row has no •••; Anu's and the invite's do.
    expect(within(people).queryByRole('button', { name: 'More options for Hari' })).toBeNull();
    expect(within(people).getByRole('button', { name: 'More options for Anu' })).toHaveClass('hl-p-more');
    expect(within(people).getByRole('button', { name: 'More options for this invite' })).toBeInTheDocument();
    // Invite someone: the person-plus in the bar and the row at the end of the list.
    const invites = screen.getAllByRole('button', { name: 'Invite someone' });
    expect(invites).toHaveLength(2);
    expect(invites[0]).toHaveClass('hl-p-tbtn');
    expect(invites[1]).toHaveClass('hl-p-row-accent');
  });

  it("Users: ••• opens the person's sheet with a grabber: Apps access, Reset password…, Make admin, Disable, Delete…", async () => {
    renderUsers();
    fireEvent.click(await screen.findByRole('button', { name: 'More options for Anu' }));
    const sheet = await screen.findByRole('dialog', { name: 'Anu' });
    expect(sheet.querySelector('.hl-sheet-handle')).not.toBeNull();
    expect(within(sheet).getByText('@anu · Member · 4 apps')).toBeInTheDocument();
    const actions = within(sheet)
      .getAllByRole('button')
      .map((b) => b.getAttribute('aria-label') ?? b.textContent);
    expect(actions).toEqual([
      'Close',
      'Apps access4 apps',
      'Reset password…Makes a link that works once, for 15 minutes',
      'Make admin',
      'Disable',
      'Delete…',
    ]);
    expect(within(sheet).getByRole('button', { name: 'Delete…' })).toHaveClass('hl-p-row-danger');
    fireEvent.click(within(sheet).getByRole('button', { name: 'Delete…' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Anu' })).toBeNull());
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
  });

  it("Users: an invite's ••• has Copy link and Revoke", async () => {
    renderUsers();
    fireEvent.click(await screen.findByRole('button', { name: 'More options for this invite' }));
    const sheet = await screen.findByRole('dialog', { name: 'Invite pending' });
    expect(within(sheet).getByRole('button', { name: 'Copy link' })).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: 'Revoke' })).toHaveClass('hl-p-row-danger');
  });

  it('Invite someone: a sheet with Close and Done in its bar, Copy link, and the role as a segmented control', async () => {
    renderUsers();
    fireEvent.click((await screen.findAllByRole('button', { name: 'Invite someone' }))[0]!);
    const sheet = await screen.findByRole('dialog', { name: 'Invite someone' });
    expect(sheet.querySelector('.hl-sheet-handle')).not.toBeNull();
    const bar = sheet.querySelector('.hl-sheet-bar') as HTMLElement;
    expect(within(bar).getByRole('button', { name: 'Close' })).toBeInTheDocument();
    expect(within(bar).getByText('Invite someone')).toBeInTheDocument();
    await waitFor(() => expect(within(bar).getByRole('button', { name: 'Done' })).toBeEnabled());
    expect(within(sheet).getByRole('textbox', { name: 'Invite link' })).toHaveValue('https://hlabs.local/invite/abc');
    expect(within(sheet).getByRole('button', { name: 'Copy link' })).toHaveClass('hl-p-primary');
    const role = within(sheet).getByRole('radiogroup', { name: 'Role' });
    expect(role).toHaveClass('hl-seg-fill');
    expect(within(role).getByRole('radio', { name: 'Member' })).toHaveAttribute('aria-checked', 'true');
    expect(within(sheet).getByText('Uses the apps you share')).toBeInTheDocument();
  });

  it("Engine: the engine's state in a card with Restart engine; the one in use has a tick", async () => {
    renderScreen(() => <SectionPage id="engine" />, {
      'auth.me': fakeMe(),
      'settings.engine.get': () => ({
        platform: 'darwin',
        status: 'running',
        active: { kind: 'colima', managedByHlabs: true, version: '27.3.1' },
        engines: [
          { kind: 'colima', availability: 'active' },
          { kind: 'docker-desktop', availability: 'notInstalled' },
        ],
      }),
      'jobs.list': () => ({ items: [] }),
      'settings.startup.get': () => ({ startAtLogin: true, startAppsAutomatically: true, keepAwake: false }),
      'events.stream': never,
    });
    await expectPage('Engine & startup');
    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('Engine running');
    const card = status.closest('.hl-p-card') as HTMLElement;
    expect(within(card).getByRole('button', { name: 'Restart engine' })).toBeInTheDocument();
    const list = screen.getByRole('group', { name: 'Container engine' });
    const rows = [...list.querySelectorAll('.hl-list-row')];
    expect(rows[0]?.querySelector('svg')).not.toBeNull();
    expect(rows[0]).toHaveTextContent('Colima, in use');
    expect(within(list).queryByRole('button', { name: 'Restart engine' })).toBeNull();
  });

  it('Network: icon squares, the local address as the value, Web ports a row you tap', async () => {
    renderScreen(() => <SectionPage id="network" shippedPhase={3} />, {
      'auth.me': fakeMe(),
      'network.status': () => ({
        home: {
          localAddress: 'https://hlabs.local',
          dnsAddress: 'https://hlabs.home.arpa',
          published: true,
          fallbackAddress: null,
          lanAddresses: [],
        },
        remote: {
          mode: 'off',
          state: 'off',
          tailnet: null,
          nodeName: null,
          url: null,
          loginUrl: null,
          keyExpiry: null,
        },
        dns: fakeDns(),
        ports: { https: 8443, http: 80 },
      }),
      'apps.list': () => ({ apps: [] }),
      'events.stream': never,
    });
    await expectPage('Network & remote access');
    const home = await screen.findByRole('group', { name: 'Home network' });
    expect(within(home).getByText('hlabs.local')).toHaveClass('hl-p-row-value');
    const ports = within(home).getByRole('button', { name: 'Change web ports' });
    expect(ports).toHaveTextContent('HTTP 80 · HTTPS 8443 (443 is used by another program)');
    expect(ports.querySelector('.hl-p-sq')).not.toBeNull();
    expect(ports.querySelector('.hl-p-chev')).not.toBeNull();
    fireEvent.click(ports);
    expect(await screen.findByRole('dialog', { name: /web ports/i })).toBeInTheDocument();
  });

  it('Advanced: hlabs logs and What hlabs connects to are rows you tap; Download is a pill in its row', async () => {
    renderAdvanced();
    const troubleshooting = await screen.findByRole('group', { name: 'Troubleshooting' });
    const logs = within(troubleshooting).getByRole('button', { name: 'View hlabs logs' });
    expect(logs.querySelector('.hl-p-chev')).not.toBeNull();
    expect(within(troubleshooting).getByRole('button', { name: 'View What hlabs connects to' })).toHaveClass(
      'hl-list-row',
    );
    expect(within(troubleshooting).getByRole('button', { name: 'Download' })).toHaveClass('hl-btn-sm');
    expect(troubleshooting.querySelectorAll('.hl-p-sq')).toHaveLength(3);
  });
});
