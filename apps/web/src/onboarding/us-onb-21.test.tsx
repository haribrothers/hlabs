import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderScreen } from '../test/render';
import { doneLead, DoneStep, firstName } from './done-step';

const handlers = (over: { totpEnabled?: boolean; root?: string; headless?: boolean } = {}) => ({
  'auth.me': () => ({
    displayName: 'Hari Prasad',
    username: 'hari',
    totpEnabled: over.totpEnabled ?? true,
    csrfToken: 'c',
  }),
  'system.info': () => ({
    hostname: 'hlabs',
    os: { platform: 'darwin', release: '25', arch: 'arm64', headless: over.headless ?? false },
  }),
  'storage.locations.list': () => ({
    locations: [
      {
        id: 'l1',
        kind: 'local',
        name: over.root ?? 'This computer',
        path: '/Users/hari/hlabs',
        isRoot: true,
        status: 'ok',
      },
    ],
  }),
});

describe('US-ONB-21', () => {
  it('greets with the first word of the display name', () => {
    expect(firstName('Hari Prasad')).toBe('Hari');
    expect(firstName(undefined)).toBe('');
  });

  it('says hlabs keeps running from the menu bar, in the background on a server, and apps only when picked', () => {
    expect(doneLead({ appsPicked: false, headless: false })).toBe('hlabs keeps running from the menu bar.');
    expect(doneLead({ appsPicked: false, headless: true })).toBe('hlabs keeps running in the background.');
    expect(doneLead({ appsPicked: true, headless: false })).toBe(
      'Your apps are installing. hlabs keeps running from the menu bar.',
    );
  });

  it('summarises the admin account with 2FA on and the storage location', async () => {
    renderScreen(DoneStep, handlers());
    expect(await screen.findByRole('heading', { level: 1, name: "You're all set, Hari" })).toHaveFocus();
    expect(screen.getByText('hlabs keeps running from the menu bar.')).toBeInTheDocument();
    const summary = screen.getByRole('group', { name: 'What was set up' });
    expect(await within(summary).findByText('hari · 2FA on')).toBeInTheDocument();
    expect(await within(summary).findByText('This computer')).toBeInTheDocument();
    // Remote access (phase 3) and installing apps (phase 2) aren't shown yet (D-036).
    expect(within(summary).queryByText('Remote access')).toBeNull();
    expect(within(summary).queryByText(/Installing/)).toBeNull();
    expect(screen.queryByText(/^Step \d/)).toBeNull();
  });

  it('shows 2FA off when it was skipped (US-ONB-13), and the drive or NAS name', async () => {
    renderScreen(DoneStep, handlers({ totpEnabled: false, root: 'nas.local/media' }));
    expect(await screen.findByText('hari · 2FA off')).toBeInTheDocument();
    expect(await screen.findByText('nas.local/media')).toBeInTheDocument();
  });
});
