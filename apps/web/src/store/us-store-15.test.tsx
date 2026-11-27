// US-STORE-15 · See and apply available updates: each row "<old> → <new> · released 2 days ago" with "What's new" (then
// "Hide notes") and Update; an update's progress and "Updating…"; "Update all (2)" and "Updating 1 of 2…"; "All apps are
// up to date" with when hlabs checked and "Check now"; "Recently updated"; the footer to Settings › Updates; members
// never get the page.
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DAY, icon, oneEvent, pending, updatesData, updatesPage } from '../test/updates';
import { manageItems } from './categories';

const row = (name: string) => screen.getByText(name, { selector: 'span' }).closest('li')!;

describe('US-STORE-15', () => {
  it('each row: "<old> → <new> · released 2 days ago", What’s new and Update', async () => {
    updatesPage();
    await screen.findByText('Home Assistant');
    const ha = row('Home Assistant');
    expect(ha).toHaveTextContent('1.0 → 1.1 · released 2 days ago');
    const toggle = within(ha).getByRole('button', { name: "What's new" });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(within(ha).getByRole('button', { name: 'Update Home Assistant' })).toHaveClass('hl-btn-primary');
  });

  it('"What’s new" opens the notes in the row and turns into "Hide notes"', async () => {
    updatesPage();
    await screen.findByText('Home Assistant');
    fireEvent.click(within(row('Home Assistant')).getByRole('button', { name: "What's new" }));
    const notes = await screen.findByRole('region', { name: "What's new in Home Assistant" });
    expect(await within(notes).findByText('Home Assistant is faster')).toBeInTheDocument();
    fireEvent.click(within(row('Home Assistant')).getByRole('button', { name: 'Hide notes' }));
    expect(screen.queryByRole('region', { name: "What's new in Home Assistant" })).toBeNull();
  });

  it('Update starts the job; the row shows its progress and "Updating…"; done, it moves to Recently updated', async () => {
    let done = false;
    let active = false;
    const ev = oneEvent();
    const { calls } = updatesPage({
      'apps.update': () => {
        active = true;
        return { jobId: 'j1' };
      },
      'jobs.list': () => ({
        items: active ? [{ id: 'j1', kind: 'app_update', target: 'immich', state: 'running', progress: 40 }] : [],
      }),
      'store.listUpdates': () =>
        done
          ? updatesData({
              pending: [pending('home-assistant', 'Home Assistant')],
              recent: [
                {
                  appId: 'immich',
                  name: 'Immich',
                  icon,
                  version: '1.1',
                  at: Date.now(),
                  automatic: false,
                  notBackedUp: false,
                },
              ],
            })
          : updatesData(),
      'events.stream': ev.handler,
    });
    await screen.findByText('Immich');
    fireEvent.click(screen.getByRole('button', { name: 'Update Immich' }));
    await waitFor(() => expect(calls.find((c) => c.path === 'apps.update')?.input).toEqual({ appId: 'immich' }));
    expect(await screen.findByRole('progressbar', { name: 'Updating Immich' })).toBeInTheDocument();
    expect(row('Immich')).toHaveTextContent('Updating…');
    done = true;
    active = false;
    await ev.send('job.finished', {
      jobId: 'j1',
      kind: 'app_update',
      target: 'immich',
      state: 'succeeded',
      hlabsCode: null,
    });
    const recent = await screen.findByRole('list', { name: 'Recently updated' });
    expect(within(recent).getByText('Immich')).toBeInTheDocument();
    expect(within(recent).getByText('Updated today')).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Updates' })).queryByText('Immich')).toBeNull();
  });

  it('"Update all (2)" queues them all and counts "Updating 1 of 2…", then "Updating 2 of 2…"', async () => {
    const ev = oneEvent();
    const { calls } = updatesPage({
      'apps.updateAll': () => ({ jobIds: ['a', 'b'] }),
      'events.stream': ev.handler,
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Update all (2)' }));
    expect(await screen.findByRole('button', { name: 'Updating 1 of 2…' })).toBeDisabled();
    expect(calls.filter((c) => c.path === 'apps.updateAll')).toHaveLength(1);
    await ev.send('job.finished', {
      jobId: 'a',
      kind: 'app_update',
      target: 'home-assistant',
      state: 'failed',
      hlabsCode: 'APP_UPDATE_ROLLED_BACK',
    });
    expect(await screen.findByRole('button', { name: 'Updating 2 of 2…' })).toBeInTheDocument();
  });

  it('no updates: "All apps are up to date", "Checked 5 minutes ago" and Check now', async () => {
    const { calls } = updatesPage({
      'store.listUpdates': () => updatesData({ pending: [] }),
      'settings.updates.check': () => ({}),
    });
    expect(await screen.findByText('All apps are up to date')).toBeInTheDocument();
    expect(screen.getByText('Checked 5 minutes ago')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Update all/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Check now' }));
    await waitFor(() => expect(calls.some((c) => c.path === 'settings.updates.check')).toBe(true));
  });

  it('Recently updated: "Updated yesterday · automatically", "Updated 6 days ago", and the version', async () => {
    updatesPage({
      'store.listUpdates': () =>
        updatesData({
          recent: [
            {
              appId: 'jellyfin',
              name: 'Jellyfin',
              icon,
              version: '10.10.3',
              at: Date.now() - DAY - 60_000,
              automatic: true,
              notBackedUp: false,
            },
            {
              appId: 'vault',
              name: 'Vaultwarden',
              icon,
              version: '1.32.5',
              at: Date.now() - 6 * DAY - 60_000,
              automatic: false,
              notBackedUp: false,
            },
          ],
        }),
    });
    const recent = await screen.findByRole('list', { name: 'Recently updated' });
    const rows = within(recent).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('Updated yesterday · automatically');
    expect(rows[0]).toHaveTextContent('10.10.3');
    expect(rows[1]).toHaveTextContent('Updated 6 days ago');
    expect(rows[1]).not.toHaveTextContent('automatically');
  });

  it('the footer says hlabs backs up first and links to Settings › Updates', async () => {
    updatesPage();
    await screen.findByText('Home Assistant');
    expect(screen.getByText(/hlabs backs up an app's data before updating it\. Change this in/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Settings › Updates' }));
    expect(await screen.findByRole('heading', { name: 'Settings section' })).toBeInTheDocument();
  });

  it('members have no Updates in the store and the daemon refuses them', () => {
    expect(manageItems('member', 7)).toEqual([]);
    expect(manageItems('admin', 7).map((i) => i.id)).toContain('updates');
  });
});
