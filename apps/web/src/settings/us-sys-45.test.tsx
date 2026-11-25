// US-SYS-45 · Make the dashboard public: the Dashboard row in Settings › Network's Public access (no tunnel, not
// public, public), DashboardPublic (the address, what changes, what only works at home, the admins' two-factor,
// Cloudflare's sign-in in front, the password), Make private, and the dashboard in the Turn off all and Remove
// confirmations. The menu-bar part is in apps/tray/test/us-sys-45.test.tsx.
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { currentToasts, dismissToast } from '../lib/toasts';
import { cloudflare, cloudflareOn, dashboardPublic, job, publicRow, status } from '../test/public';
import { daemonError, renderScreen, type Handlers } from '../test/render';
import { PublicAccess } from './public-access';

const never = () => new Promise(() => {});
afterEach(() => {
  for (const t of currentToasts()) dismissToast(t.id);
});

const admins = {
  users: [
    { id: 'u1', username: 'hari', displayName: 'Hari', role: 'admin', avatarColor: null, totpEnabled: true },
    { id: 'u2', username: 'asha', displayName: 'Asha', role: 'admin', avatarColor: null, totpEnabled: true },
    { id: 'u3', username: 'ravi', displayName: 'Ravi', role: 'member', avatarColor: null, totpEnabled: false },
  ].map((u) => ({ ...u, lastActiveAt: null, disabled: false, appCount: 0 })),
};

function open(handlers: Handlers = {}) {
  return renderScreen(
    () => <PublicAccess shippedPhase={7} />,
    {
      'public.status': () => status(cloudflareOn(), [publicRow()]),
      'users.list': () => admins,
      'events.stream': never,
      ...handlers,
    },
    { path: '/settings/network' },
  );
}

const row = async () =>
  (await screen.findByText('Dashboard', { selector: 'span, div, p' })).closest('.hl-list-row') as HTMLElement;

describe('US-SYS-45', () => {
  it('without Cloudflare Tunnel the Dashboard row says to set it up first, and offers nothing', async () => {
    open({ 'public.status': () => status(cloudflare()) });
    const group = await screen.findByRole('group', { name: 'Public access' });
    expect(within(group).getByText('Set up Cloudflare Tunnel first to make the dashboard public.')).toBeInTheDocument();
    expect(within(group).queryByRole('button', { name: 'Make public…' })).toBeNull();
  });

  it('with the tunnel it is off by default: "Not public. Reach it at home or on your tailnet." with Make public…', async () => {
    open();
    const group = await screen.findByRole('group', { name: 'Public access' });
    expect(within(group).getByText('Not public. Reach it at home or on your tailnet.')).toBeInTheDocument();
    expect(within(group).getByRole('button', { name: 'Make public…' })).toBeInTheDocument();
    expect(screen.getByText('Makes every app private. Cloudflare Tunnel stays set up.')).toBeInTheDocument();
  });

  it('DashboardPublic shows the address, what changes, what only works at home, the admins and asks for the password', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Make public…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Make the dashboard public' });
    expect(within(dialog).getByLabelText('Name under example.com')).toHaveValue('hlabs');
    expect(dialog).toHaveTextContent('.example.com');
    expect(dialog).toHaveTextContent(
      'Anyone on the internet can reach the sign-in page. Everyone signs in with two-factor, and some changes only work at home.',
    );
    const home = within(dialog).getByRole('list', { name: 'Only at home' });
    for (const item of [
      'Factory reset',
      'Public access and the network',
      'People, roles and invites',
      'Switching the engine',
    ])
      expect(within(home).getByText(item)).toBeInTheDocument();
    expect(dialog).toHaveTextContent(
      'Making things private, turning off public access and signing out everywhere always work.',
    );
    const list = await within(dialog).findByRole('list', { name: 'Admins with two-factor' });
    expect(within(list).getByText('Hari')).toBeInTheDocument();
    expect(within(list).getByText('Asha')).toBeInTheDocument();
    expect(within(list).queryByText('Ravi')).toBeNull();
    expect(dialog).toHaveTextContent("Members without two-factor can't sign in there until they turn it on.");
    // Cloudflare's sign-in in front is recommended, on to start with (US-SYS-48).
    expect(
      within(dialog).getByRole('switch', { name: "Add Cloudflare's sign-in in front (recommended)" }),
    ).toBeChecked();
    expect(dialog).toHaveTextContent('The other admins are told when the dashboard is made public.');
    expect(within(dialog).getByRole('button', { name: 'Make the dashboard public' })).toBeDisabled();
  });

  it('an admin without two-factor blocks it, by name, and the button stays off', async () => {
    open({
      'public.status': () => status(cloudflareOn(), [], null, ['Asha']),
      'users.list': () => ({ users: admins.users.map((u) => (u.id === 'u2' ? { ...u, totpEnabled: false } : u)) }),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Make public…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Make the dashboard public' });
    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      "Asha hasn't turned on two-factor login yet. Every admin needs it before the dashboard can be public.",
    );
    await waitFor(() =>
      expect(within(dialog).getByRole('list', { name: 'Admins with two-factor' })).toHaveTextContent('Hari'),
    );
    const asha = within(within(dialog).getByRole('list', { name: 'Admins with two-factor' })).getByText('Asha');
    expect(asha.closest('li')).toHaveTextContent('No two-factor yet');
    fireEvent.change(within(dialog).getByLabelText('Password'), { target: { value: 'pw' } });
    expect(within(dialog).getByRole('button', { name: 'Make the dashboard public' })).toBeDisabled();
  });

  it('confirming makes it public with the name and password, then adds Cloudflare’s sign-in with the addresses', async () => {
    const { calls } = open({
      'public.setDashboard': () => ({ jobId: 'job-on' }),
      'public.setDashboardAccess': () => ({ jobId: 'job-acc' }),
      'jobs.get': (input) => job({ id: (input as { jobId: string }).jobId, kind: 'dashboard_public_on', target: null }),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Make public…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Make the dashboard public' });
    const email = within(dialog).getByRole('textbox', { name: 'Email addresses allowed' });
    fireEvent.change(email, { target: { value: 'hari@example.com' } });
    fireEvent.keyDown(email, { key: 'Enter' });
    expect(within(dialog).getByRole('button', { name: 'Remove hari@example.com' })).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('Password'), { target: { value: 'correct horse' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Make the dashboard public' }));
    await waitFor(() => expect(calls.filter((c) => c.path === 'public.setDashboardAccess')).toHaveLength(1));
    expect(calls.find((c) => c.path === 'public.setDashboard')!.input).toEqual({
      public: true,
      hostname: 'hlabs',
      password: 'correct horse',
    });
    expect(calls.find((c) => c.path === 'public.setDashboardAccess')!.input).toEqual({ emails: ['hari@example.com'] });
    await waitFor(() => expect(currentToasts().some((t) => t.title === 'The dashboard is public')).toBe(true));
  });

  it('a wrong password says so in the field', async () => {
    open({ 'public.setDashboard': () => Promise.reject(daemonError('AUTH_INVALID_PASSWORD')) });
    fireEvent.click(await screen.findByRole('button', { name: 'Make public…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Make the dashboard public' });
    fireEvent.click(within(dialog).getByRole('switch', { name: "Add Cloudflare's sign-in in front (recommended)" }));
    fireEvent.change(within(dialog).getByLabelText('Password'), { target: { value: 'nope' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Make the dashboard public' }));
    expect(await within(dialog).findByText("That password isn't right. Check it and try again.")).toBeInTheDocument();
  });

  it('public, the row reads "Public at https://hlabs.example.com · since 3 Dec by Hari" with the Public badge', async () => {
    open({ 'public.status': () => status(cloudflareOn(), [publicRow()], dashboardPublic()) });
    const r = await row();
    expect(within(r).getByText('Public')).toBeInTheDocument();
    expect(r).toHaveTextContent(/Public at https:\/\/hlabs\.example\.com · since (3 Dec|Dec 3) by Hari/);
    expect(within(r).getByRole('link', { name: 'https://hlabs.example.com' })).toHaveAttribute(
      'href',
      'https://hlabs.example.com',
    );
    expect(within(r).getByRole('button', { name: 'Make private: Dashboard' })).toBeInTheDocument();
    expect(
      screen.getByText('Makes the dashboard and every app private. Cloudflare Tunnel stays set up.'),
    ).toBeInTheDocument();
  });

  it('Make private asks first and makes it private in a job', async () => {
    const { calls } = open({
      'public.status': () => status(cloudflareOn(), [], dashboardPublic()),
      'public.setDashboard': () => ({ jobId: 'job-off' }),
      'jobs.get': () => job({ id: 'job-off', kind: 'dashboard_public_off', target: null }),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Make private: Dashboard' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Make the dashboard private?' });
    expect(dialog).toHaveTextContent(
      'https://hlabs.example.com stops answering within seconds, and everyone signed in there is signed out.',
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Make private' }));
    await waitFor(() => expect(calls.find((c) => c.path === 'public.setDashboard')?.input).toEqual({ public: false }));
    await waitFor(() => expect(currentToasts().some((t) => t.title === 'The dashboard is private')).toBe(true));
  });

  it('Turn off all public access lists the dashboard first, with the apps', async () => {
    open({
      'public.status': () => status(cloudflareOn(), [publicRow()], dashboardPublic()),
      'public.turnOffAll': () => ({ jobId: 'j' }),
      'jobs.get': () => job({ id: 'j', kind: 'public_off_all', target: null }),
    });
    fireEvent.click(await screen.findByRole('button', { name: /Turn off all public access/ }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Turn off all public access?' });
    const rows = within(dialog).getAllByText(/^https:\/\//);
    expect(rows.map((r) => r.textContent)).toEqual(['https://hlabs.example.com', 'https://photos.example.com']);
    expect(within(dialog).getByText('hlabs dashboard')).toBeInTheDocument();
    expect(dialog).toHaveTextContent('The dashboard and these apps stop answering on the internet within seconds');
  });

  it('only the dashboard public still offers Turn off all', async () => {
    open({ 'public.status': () => status(cloudflareOn(), [], dashboardPublic()) });
    expect(await screen.findByRole('button', { name: /Turn off all public access/ })).toBeInTheDocument();
  });

  it('removing Cloudflare Tunnel lists the dashboard in the confirmation, made private first', async () => {
    open({ 'public.status': () => status(cloudflareOn(), [publicRow()], dashboardPublic()) });
    fireEvent.click(await screen.findByRole('button', { name: 'Remove…' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Remove Cloudflare Tunnel?' });
    expect(within(dialog).getByText('hlabs dashboard')).toBeInTheDocument();
    expect(dialog).toHaveTextContent('hlabs makes the dashboard and these apps private first');
    expect(within(dialog).getByRole('button', { name: 'Make private and remove' })).toBeInTheDocument();
  });
});
