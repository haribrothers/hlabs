// US-STORE-02 · Navigate with the categories sidebar.
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderScreen } from '../test/render';
import { fakeMe } from '../test/me';
import { manageItems, StoreChips, StoreSidebar } from './categories';

const handlers = (role: 'admin' | 'member' = 'admin') => ({
  'store.listCategories': () => ({
    categories: [
      { id: 'media', count: 3 },
      { id: 'files', count: 2 },
      { id: 'ai', count: 1 },
    ],
  }),
  'auth.me': fakeMe({ role }),
});

describe('US-STORE-02', () => {
  it('lists Discover and every category with apps, in order, the current one marked', async () => {
    renderScreen(StoreSidebar, handlers(), { path: '/store/category/files' });
    const nav = await screen.findByRole('navigation', { name: 'Categories' });
    await within(nav).findByRole('link', { name: 'Media' });
    expect(
      within(nav)
        .getAllByRole('link')
        .map((l) => l.textContent),
    ).toEqual(['Discover', 'Media', 'Files & photos', 'Local AI']);
    expect(within(nav).getByRole('link', { name: 'Files & photos' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: 'Files & photos' })).toHaveAttribute('href', '/store/category/files');
  });

  it('"Manage apps" is admin-only, and its items appear only as their phases ship (D-036)', () => {
    expect(manageItems('admin', 2)).toEqual([]);
    expect(manageItems('admin', 7).map((i) => i.label)).toEqual(['Updates', 'App sources']);
    expect(manageItems('admin', 8).map((i) => i.label)).toEqual(['Updates', 'App sources', 'Deploy your own app']);
    expect(manageItems('member', 8)).toEqual([]);
  });

  it('in phase 2 the sidebar has no "Manage apps" group, even for an admin', async () => {
    renderScreen(StoreSidebar, handlers('admin'), { path: '/store' });
    await screen.findByRole('link', { name: 'Media' });
    expect(screen.queryByRole('navigation', { name: 'Manage apps' })).toBeNull();
  });

  it('on a phone the categories are chips', async () => {
    renderScreen(StoreChips, handlers(), { path: '/store' });
    const nav = await screen.findByRole('navigation', { name: 'Categories' });
    await within(nav).findByRole('link', { name: 'Local AI' });
    expect(within(nav).getByRole('link', { name: 'Discover' })).toHaveAttribute('aria-current', 'page');
  });
});
