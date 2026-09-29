import { useQuery } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mutationErrorNotice, pageQuery } from '../lib/error-copy';
import { currentToasts, dismissToast } from '../lib/toasts';
import { onceToLogin } from '../login/signed-out';
import { daemonError, renderWithDaemon } from '../test/render';
import { RouteError, RouteNotFound } from './route-fallbacks';

afterEach(() => {
  for (const t of currentToasts()) dismissToast(t.id);
});

/** A router like the app's: the fallbacks render inside the layout, at the same URL. */
function renderAt(path: string, Page: () => React.ReactNode) {
  const root = createRootRoute({
    component: () => (
      <main>
        <nav aria-label="Tab bar" />
        <Outlet />
      </main>
    ),
  });
  const page = createRoute({ getParentRoute: () => root, path: '/settings/engine', component: Page });
  const home = createRoute({ getParentRoute: () => root, path: '/', component: () => <p>Home</p> });
  const router = createRouter({
    routeTree: root.addChildren([page, home]),
    history: createMemoryHistory({ initialEntries: [path] }),
    defaultErrorComponent: RouteError,
    defaultNotFoundComponent: RouteNotFound,
  });
  renderWithDaemon(<RouterProvider router={router as never} />, {
    'auth.me': () => ({ id: 'u1', username: 'sam', displayName: 'Sam', role: 'member', avatarColor: null }),
  });
  return router;
}

describe('US-STATE-20', () => {
  it('parallel UNAUTHORIZED answers lead to one navigation to /login?next=<path>', async () => {
    let finish: () => void = () => {};
    const navigate = vi.fn(() => new Promise<void>((r) => (finish = r)));
    const lost = onceToLogin({
      location: () => ({ pathname: '/settings/engine', href: '/settings/engine?tab=1' }),
      hasUsers: () => true,
      navigate,
    });
    lost();
    lost();
    lost();
    expect(navigate).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith({ to: '/login', search: { next: '/settings/engine?tab=1' } });
    finish();
    await Promise.resolve();
    await Promise.resolve();
    lost();
    expect(navigate).toHaveBeenCalledTimes(2);
  });

  it('a FORBIDDEN mutation is a danger toast "You don\'t have access to that." and nothing else', () => {
    mutationErrorNotice(daemonError('ACCESS_DENIED'), undefined);
    expect(currentToasts()).toEqual([
      expect.objectContaining({ tone: 'danger', title: "You don't have access to that." }),
    ]);
  });

  it('JOB_EXCLUSIVE_RUNNING is a warning toast naming what runs; inline-error mutations are left alone', () => {
    mutationErrorNotice(daemonError('JOB_EXCLUSIVE_RUNNING', { runningKind: 'backup' }), undefined);
    expect(currentToasts().at(-1)).toMatchObject({
      tone: 'warning',
      body: 'Wait for the backup to finish, then try again.',
    });
    mutationErrorNotice(daemonError('ACCESS_DENIED'), { inlineErrors: true });
    expect(currentToasts()).toHaveLength(1);
  });

  it('a page whose query is FORBIDDEN shows "You don\'t have access to this" at the same URL, in the layout', async () => {
    const router = renderAt('/settings/engine', function Page() {
      useQuery({
        queryKey: ['engine'],
        queryFn: () => Promise.reject(daemonError('ACCESS_DENIED')),
        ...pageQuery,
      });
      return <p>Engine</p>;
    });
    expect(await screen.findByRole('heading', { name: "You don't have access to this" })).toBeInTheDocument();
    expect(screen.getByText('Ask an admin if you need it.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to Home' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('navigation', { name: 'Tab bar' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/settings/engine');
    await waitFor(() => expect(document.title).toBe('No access · hlabs'));
    expect(screen.queryByText(/404/)).toBeNull();
  });

  it('an address that matches nothing shows "Page not found" with Go to Home (before phase 8)', async () => {
    const router = renderAt('/no/such/page', () => <p>Engine</p>);
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to Home' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/no/such/page');
  });

  it('any other page failure is "Something went wrong", never the raw error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderAt('/settings/engine', () => {
      throw new Error('ENOENT /var/lib/hlabs/db.sqlite');
    });
    expect(await screen.findByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('ENOENT');
  });
});
