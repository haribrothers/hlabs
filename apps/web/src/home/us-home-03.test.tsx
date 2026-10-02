import { fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { browser } from '../lib/browser';
import { renderScreen } from '../test/render';
import { AppGrid, appUrl, orderApps, type HomeApp } from './app-grid';

const app = (id: string, name: string, extra: Partial<HomeApp> = {}): HomeApp => ({
  id,
  name,
  state: 'running',
  icon: { logoUrl: null, gradient: null, fallback: null },
  embed: false,
  ownLogin: false,
  urls: { local: `https://${id}.hlabs.local`, tailnet: `https://hlabs.tail1234.ts.net:14001` },
  ...extra,
});

afterEach(() => vi.restoreAllMocks());

describe('US-HOME-03', () => {
  it('orders apps as saved; apps not in the layout go at the end', () => {
    const list = [app('jellyfin', 'Jellyfin'), app('pihole', 'Pi-hole'), app('immich', 'Immich')];
    expect(orderApps(list, ['immich', 'gone', 'jellyfin']).map((a) => a.id)).toEqual(['immich', 'jellyfin', 'pihole']);
  });

  it('each tile is "Open <name>" with the name under it, and opens the app in a new tab', async () => {
    const open = vi.spyOn(browser, 'open').mockImplementation(() => {});
    renderScreen(() => <AppGrid apps={[app('jellyfin', 'Jellyfin'), app('pihole', 'Pi-hole')]} isAdmin />, {});
    const tile = await screen.findByRole('button', { name: 'Open Jellyfin' });
    expect(tile).toHaveTextContent('Jellyfin');
    fireEvent.click(tile);
    expect(open).toHaveBeenCalledWith('https://jellyfin.hlabs.local');
  });

  it('on the tailnet name apps open on their port there', () => {
    const a = app('immich', 'Immich');
    expect(appUrl(a, { hostname: 'hlabs.tail1234.ts.net' })).toBe('https://hlabs.tail1234.ts.net:14001');
    expect(appUrl(a, { hostname: 'hlabs.local' })).toBe('https://immich.hlabs.local');
  });

  it('without a logo: the manifest gradient and glyph, or a neutral tile with the first letter', async () => {
    const { container } = renderScreen(
      () => (
        <AppGrid
          apps={[
            app('plain', 'Paperless'),
            app('kuma', 'Uptime Kuma', {
              icon: { logoUrl: null, gradient: ['#84cc16', '#4d7c0f'], fallback: 'activity' },
            }),
          ]}
          isAdmin={false}
        />
      ),
      {},
    );
    await screen.findByRole('button', { name: 'Open Paperless' });
    const [plain, kuma] = [...container.querySelectorAll<HTMLElement>('[data-state="fallback"]')];
    expect(plain).toHaveTextContent('P');
    expect(plain!.style.background).toContain('rgb(100, 116, 139)');
    expect(kuma!.style.background).toContain('rgb(132, 204, 22)');
  });

  it('arrow keys move focus between tiles', async () => {
    renderScreen(() => <AppGrid apps={[app('a', 'Alpha'), app('b', 'Beta'), app('c', 'Gamma')]} isAdmin={false} />, {});
    const alpha = await screen.findByRole('button', { name: 'Open Alpha' });
    alpha.focus();
    fireEvent.keyDown(alpha, { key: 'ArrowRight' });
    expect(screen.getByRole('button', { name: 'Open Beta' })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' });
    expect(alpha).toHaveFocus();
  });

  it('admins get "Install app" now the App Store has shipped (phase 2)', async () => {
    renderScreen(() => <AppGrid apps={[app('a', 'Alpha')]} isAdmin />, {});
    await screen.findByRole('button', { name: 'Open Alpha' });
    expect(screen.getByRole('link', { name: 'Install app' })).toBeInTheDocument();
  });

  it('members never get "Install app"', async () => {
    renderScreen(() => <AppGrid apps={[app('a', 'Alpha')]} isAdmin={false} />, {});
    await screen.findByRole('button', { name: 'Open Alpha' });
    expect(screen.queryByRole('link', { name: 'Install app' })).toBeNull();
  });
});
