// US-PHONE-01 · The Settings tab on a phone (PhoneSettings, D-172): the person's own card, the sections as inset
// grouped lists, and the values at the right of some rows: how many people, when the last backup ran (or "Not set
// up"), the free space, and the update count as a badge. Each value loads on its own; the list never waits.
import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeMe } from '../test/me';
import { phoneViewport } from '../test/phone';
import { daemonError, renderScreen, type Handlers } from '../test/render';
import { updatesData } from '../test/updates';
import { PhoneSettingsList } from './phone-settings';
import { visibleSections } from './sections';

const never = () => new Promise(() => {});
const HOUR = 3_600_000;
const me = fakeMe()();

function settings(handlers: Handlers = {}) {
  return renderScreen(
    () => <PhoneSettingsList me={me as never} sections={visibleSections('admin', 9)} shippedPhase={9} />,
    {
      'users.list': () => ({ users: [{ id: 'u1' }, { id: 'u2' }, { id: 'u3' }] }),
      'backups.overview': () => ({
        lastRun: { finishedAt: Date.now() - 2 * HOUR, startedAt: Date.now() - 2 * HOUR - 60_000 },
        destinations: [{ id: 'd1', name: 'NAS' }],
      }),
      'storage.summary': () => ({ totalBytes: 256e9, freeBytes: 142e9 }),
      'store.listUpdates': () => updatesData(),
      'events.stream': never,
      ...handlers,
    },
    { path: '/settings' },
  );
}

const row = (name: string) => screen.getByRole('link', { name: new RegExp(`^${name}`) });

let restore: () => void;
beforeEach(() => {
  restore = phoneViewport();
});
afterEach(() => {
  restore();
  vi.restoreAllMocks();
});

describe('US-PHONE-01', () => {
  it('Settings: the account card, then the sections with their values', async () => {
    settings();
    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Account' })).toHaveAccessibleDescription('Hari');
    await waitFor(() => expect(row('Users')).toHaveTextContent('Users3'));
    await waitFor(() => expect(row('Backups')).toHaveTextContent('Backups2 hours ago'));
    await waitFor(() => expect(row('Storage')).toHaveTextContent(/^Storage\s*142 GB free$/));
    // The App Store's count as a red badge, read as "2 updates".
    const updates = row('Updates');
    await waitFor(() => expect(within(updates).getByText('2 updates')).toBeInTheDocument());
    expect(updates.querySelector('.hl-p-badge')).toHaveTextContent('2');
  });

  it('no backup destination yet: "Not set up"', async () => {
    settings({ 'backups.overview': () => ({ lastRun: null, destinations: [] }) });
    await waitFor(() => expect(row('Backups')).toHaveTextContent('BackupsNot set up'));
  });

  it('while values load or when they fail the rows show nothing at the right, and the list is there', async () => {
    settings({
      'users.list': never,
      'backups.overview': () => {
        throw daemonError('INTERNAL');
      },
      'storage.summary': never,
      'store.listUpdates': () => updatesData({ pending: [] }),
    });
    await screen.findByRole('heading', { level: 1, name: 'Settings' });
    expect(row('Users')).toHaveTextContent(/^Users$/);
    expect(row('Storage')).toHaveTextContent(/^Storage$/);
    await new Promise((r) => setTimeout(r, 50));
    expect(row('Backups')).toHaveTextContent(/^Backups$/);
    expect(row('Updates').querySelector('.hl-p-badge')).toBeNull();
  });

  it('members get no values about the computer', async () => {
    const users = vi.fn(() => ({ users: [] }));
    renderScreen(
      () => (
        <PhoneSettingsList
          me={fakeMe({ role: 'member' })() as never}
          sections={visibleSections('member', 9)}
          shippedPhase={9}
        />
      ),
      { 'users.list': users, 'events.stream': never },
      { path: '/settings' },
    );
    expect(screen.queryByRole('link', { name: /^Users/ })).toBeNull();
    await new Promise((r) => setTimeout(r, 50));
    expect(users).not.toHaveBeenCalled();
  });
});
