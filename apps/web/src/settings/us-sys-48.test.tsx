// US-SYS-48 · Add Cloudflare's sign-in in front of the dashboard (CloudflareAccessSetup): adding it with the email
// addresses allowed, the row "Cloudflare's sign-in in front · 3 email addresses" with Change… and Remove, and the API
// token asked for when the Cloudflare sign-in can't manage Access.
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { currentToasts, dismissToast } from '../lib/toasts';
import { cloudflareOn, dashboardPublic, job, status } from '../test/public';
import { daemonError, renderScreen, type Handlers } from '../test/render';
import { PublicAccess } from './public-access';

const never = () => new Promise(() => {});
afterEach(() => {
  for (const t of currentToasts()) dismissToast(t.id);
});

const three = { emails: ['hari@example.com', 'asha@example.com', 'ravi@example.com'] };

function open(handlers: Handlers = {}, access: { emails: string[] } | null = null) {
  return renderScreen(
    () => <PublicAccess shippedPhase={7} />,
    {
      'public.status': () => status(cloudflareOn(), [], dashboardPublic({ cloudflareAccess: access })),
      'jobs.get': (input) => job({ id: (input as { jobId: string }).jobId, kind: 'dashboard_access', target: null }),
      'events.stream': never,
      ...handlers,
    },
    { path: '/settings/network' },
  );
}

const addEmail = (dialog: HTMLElement, email: string) => {
  const field = within(dialog).getByRole('textbox', { name: 'Email addresses allowed' });
  fireEvent.change(field, { target: { value: email } });
  fireEvent.keyDown(field, { key: 'Enter' });
};

describe('US-SYS-48', () => {
  it('explains it and asks for the email addresses allowed, then adds it for the dashboard’s name', async () => {
    const { calls } = open({ 'public.setDashboardAccess': () => ({ jobId: 'acc1' }) });
    fireEvent.click(await screen.findByRole('button', { name: "Add Cloudflare's sign-in…" }));
    const dialog = await screen.findByRole('dialog', { name: "Add Cloudflare's sign-in in front" });
    expect(dialog).toHaveTextContent(
      "Cloudflare asks for a code sent to an email address on your list before showing hlabs's sign-in. It's free for up to 50 people.",
    );
    expect(dialog).toHaveTextContent('Press Return after each one. Only admins see this list.');
    expect(dialog).toHaveTextContent(
      'hlabs makes this in Cloudflare Zero Trust for hlabs.example.com and removes it when the dashboard is private.',
    );
    expect(within(dialog).getByRole('button', { name: "Add Cloudflare's sign-in" })).toBeDisabled();
    addEmail(dialog, 'Hari@Example.com');
    addEmail(dialog, 'asha@example.com');
    fireEvent.click(within(dialog).getByRole('button', { name: "Add Cloudflare's sign-in" }));
    await waitFor(() => expect(calls.filter((c) => c.path === 'public.setDashboardAccess')).toHaveLength(1));
    expect(calls.find((c) => c.path === 'public.setDashboardAccess')!.input).toEqual({
      emails: ['hari@example.com', 'asha@example.com'],
    });
    await waitFor(() =>
      expect(currentToasts().some((t) => t.title === "Cloudflare's sign-in is in front of the dashboard")).toBe(true),
    );
  });

  it('refuses something that isn’t an email address', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: "Add Cloudflare's sign-in…" }));
    const dialog = await screen.findByRole('dialog', { name: "Add Cloudflare's sign-in in front" });
    addEmail(dialog, 'not an address');
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Enter an email address such as hari@example.com.');
  });

  it('when the Cloudflare sign-in can’t manage Access it says so and asks for a token, kept in the keychain', async () => {
    let tries = 0;
    const { calls } = open({
      'public.setDashboardAccess': () =>
        ++tries === 1
          ? Promise.reject(daemonError('CLOUDFLARE_FAILED', { step: 'access', needsToken: true }))
          : { jobId: 'acc2' },
    });
    fireEvent.click(await screen.findByRole('button', { name: "Add Cloudflare's sign-in…" }));
    const dialog = await screen.findByRole('dialog', { name: "Add Cloudflare's sign-in in front" });
    addEmail(dialog, 'hari@example.com');
    fireEvent.click(within(dialog).getByRole('button', { name: "Add Cloudflare's sign-in" }));
    expect(
      await within(dialog).findByText(
        "Your Cloudflare sign-in can't manage Cloudflare Access. Add an API token with these two permissions.",
      ),
    ).toBeInTheDocument();
    expect(dialog).toHaveTextContent('Account · Access: Apps and Policies · Edit');
    expect(dialog).toHaveTextContent('Account · Access: Organizations, Identity Providers, and Groups · Edit');
    expect(dialog).toHaveTextContent("Kept in this computer's keychain with your other Cloudflare sign-in.");
    fireEvent.change(within(dialog).getByLabelText('API token'), { target: { value: 'tok-0123456789abcdefghij' } });
    fireEvent.click(within(dialog).getByRole('button', { name: "Add Cloudflare's sign-in" }));
    await waitFor(() => expect(calls.filter((c) => c.path === 'public.setDashboardAccess')).toHaveLength(2));
    expect(calls.filter((c) => c.path === 'public.setDashboardAccess')[1]!.input).toEqual({
      emails: ['hari@example.com'],
      token: 'tok-0123456789abcdefghij',
    });
  });

  it('on, the row reads "Cloudflare’s sign-in in front · 3 email addresses" with Change…, which changes the list', async () => {
    const { calls } = open({ 'public.setDashboardAccess': () => ({ jobId: 'acc3' }) }, three);
    const line = await screen.findByText("Cloudflare's sign-in in front · 3 email addresses");
    expect(line).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Change…' }));
    const dialog = await screen.findByRole('dialog', { name: "Change Cloudflare's sign-in" });
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove ravi@example.com' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(calls.find((c) => c.path === 'public.setDashboardAccess')?.input).toEqual({
        emails: ['hari@example.com', 'asha@example.com'],
      }),
    );
  });

  it('Remove asks first, then removes it', async () => {
    const { calls } = open({ 'public.setDashboardAccess': () => ({ jobId: 'acc4' }) }, three);
    fireEvent.click(await screen.findByRole('button', { name: 'Change…' }));
    const dialog = await screen.findByRole('dialog', { name: "Change Cloudflare's sign-in" });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));
    const ask = await screen.findByRole('alertdialog', { name: "Remove Cloudflare's sign-in?" });
    fireEvent.click(within(ask).getByRole('button', { name: 'Remove' }));
    await waitFor(() =>
      expect(calls.find((c) => c.path === 'public.setDashboardAccess')?.input).toEqual({ off: true }),
    );
  });
});
