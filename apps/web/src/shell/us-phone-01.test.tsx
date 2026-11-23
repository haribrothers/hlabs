// US-PHONE-01 · Switch to the phone layout with a bottom tab bar: the tabs and their order for admins and members,
// the App Store badge and the current tab's soft highlight (D-172), which page each opens, a tab the member doesn't have, and the tab of the page you're on.
import { TabBar, UiStringsProvider, type AreaId } from '@hlabs/ui';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { uiStrings } from '../copy/shell';
import { daemonError, renderScreen } from '../test/render';
import { UsagePage } from '../usage/usage-page';
import { AREA_PATHS, phoneAreas, storeBadge, type NavAccess } from './areas';
import { filesRoot } from './shell';

const admin: NavAccess = { role: 'admin', canSeeUsage: true, canInstallApps: true };
const member = (canSeeUsage = false, canInstallApps = false): NavAccess => ({
  role: 'member',
  canSeeUsage,
  canInstallApps,
});
const labels = (access: NavAccess) => phoneAreas({ access, shippedPhase: 9 }).map((a) => a.label);

describe('US-PHONE-01', () => {
  it('admins get Home, App Store, Files, Usage and Settings, each with an icon, and no search circle', () => {
    expect(labels(admin)).toEqual(['Home', 'App Store', 'Files', 'Usage', 'Settings']);
    render(
      <UiStringsProvider strings={uiStrings}>
        <TabBar items={phoneAreas({ access: admin, shippedPhase: 9 })} active="home" />
      </UiStringsProvider>,
    );
    const tabs = screen.getAllByRole('button');
    expect(tabs).toHaveLength(5);
    for (const tab of tabs) expect(tab.querySelector('svg')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Search' })).toBeNull();
  });

  it('each tab opens its page; the active one has aria-current="page"', () => {
    expect(phoneAreas({ access: admin, shippedPhase: 9 }).map((a) => AREA_PATHS[a.id as AreaId])).toEqual([
      '/',
      '/store',
      '/files',
      '/usage',
      '/settings',
    ]);
    const onSelect = vi.fn();
    render(
      <UiStringsProvider strings={uiStrings}>
        <TabBar items={phoneAreas({ access: admin, shippedPhase: 9 })} active="files" onSelect={onSelect} />
      </UiStringsProvider>,
    );
    const files = screen.getByRole('button', { name: 'Files' });
    expect(files).toHaveAttribute('aria-current', 'page');
    // Not colour alone: the current tab has the soft highlight behind its glyph, and only it does (D-172).
    expect(files.querySelector('.hl-tab-lens')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Home' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('button', { name: 'Home' }).querySelector('.hl-tab-lens')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Usage' }));
    expect(onSelect).toHaveBeenCalledWith('usage');
  });

  it('2 updates: the App Store tab says "2 updates"; none with 0, and never for members', () => {
    const items = phoneAreas({ access: admin, shippedPhase: 9 }).map((a) =>
      a.id === 'store' ? { ...a, badge: storeBadge(2, { access: admin, shippedPhase: 9 }) } : a,
    );
    render(
      <UiStringsProvider strings={uiStrings}>
        <TabBar items={items} />
      </UiStringsProvider>,
    );
    expect(screen.getByLabelText('2 updates')).toHaveTextContent('2');
    expect(storeBadge(0, { access: admin, shippedPhase: 9 })).toBeUndefined();
    expect(storeBadge(2, { access: member(true, true), shippedPhase: 9 })).toBeUndefined();
  });

  it('members: Home, Files and Settings; App Store when they may install, Usage when they may see it; admin order', () => {
    expect(labels(member())).toEqual(['Home', 'Files', 'Settings']);
    expect(labels(member(false, true))).toEqual(['Home', 'App Store', 'Files', 'Settings']);
    expect(labels(member(true))).toEqual(['Home', 'Files', 'Usage', 'Settings']);
    expect(labels(member(true, true))).toEqual(['Home', 'App Store', 'Files', 'Usage', 'Settings']);
  });

  it('a member who opens /usage without access sees "You don\'t have access to this", no redirect', async () => {
    const { router } = renderScreen(
      UsagePage,
      {
        'usage.overview': () => {
          throw daemonError('ACCESS_DENIED');
        },
        'usage.current': () => {
          throw daemonError('ACCESS_DENIED');
        },
        'usage.history': () => ({ points: [] }),
        'events.stream': () => new Promise(() => {}),
      },
      { path: '/usage' },
    );
    expect(await screen.findByText("You don't have access to this")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/usage');
  });

  it("Files' tab again goes back to the root of the place you're in", () => {
    expect(filesRoot('/home/Documents/Bills')).toBe('/home');
    expect(filesRoot('/shared/Media')).toBe('/shared');
    expect(filesRoot('/drives/d1/Photos/2024')).toBe('/drives/d1');
    expect(filesRoot('/home')).toBe('/home');
  });
});
