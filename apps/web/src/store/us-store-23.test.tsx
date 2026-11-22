// US-STORE-23 · Find the apps people run on a home server (dashboard): "x86 only" in place of the platform tag on an
// arm64 computer, and the credit under About for an app drafted from another store's definition.
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderScreen } from '../test/render';
import { details, storeApp } from '../test/store';
import { AppDetails } from './app-details';
import { storeTags } from './store-app';

const never = () => new Promise(() => {});
const show = (d: ReturnType<typeof details>) =>
  renderScreen(() => <AppDetails appId={d.app.id} />, {
    'store.getApp': () => d,
    'apps.list': () => ({ apps: [] }),
    'events.stream': never,
  });

describe('US-STORE-23', () => {
  it('"x86 only" replaces the platform tag on an arm64 computer, and nothing shows on an x86 one', () => {
    const app = storeApp('pinchflat', 'Pinchflat', { arm64: false });
    expect(storeTags(app, { os: 'macos', arm64: true })).toEqual(['x86 only']);
    expect(storeTags(app, { os: 'linux', arm64: true })).toEqual(['x86 only']);
    expect(storeTags(app, { os: 'linux', arm64: false })).toEqual([]);
  });

  it('the details page shows "x86 only", the note and "Runs on", and keeps Install off (AppDetailsX86)', async () => {
    show(details({ app: storeApp('immich', 'Immich', { arm64: false }) }));
    expect(await screen.findByText('x86 only')).toBeInTheDocument();
    expect(screen.queryByText('Apple Silicon')).toBeNull();
    expect(screen.getByRole('note')).toHaveTextContent(
      "There's no Apple Silicon version of this app yet. It runs on computers with an Intel or AMD chip.",
    );
    expect(screen.getByLabelText('About this app')).toHaveTextContent('Runs onIntel and AMD (x86-64)');
    expect(screen.getByRole('button', { name: 'Install' })).toBeDisabled();
  });

  it('an app drafted from Runtipi credits it under About; one written for hlabs says nothing', async () => {
    show(details({ packagedFrom: { store: 'Runtipi', license: 'GPL-3.0' } }));
    expect(await screen.findByText('Packaged with help from the Runtipi app store (GPL-3.0)')).toBeInTheDocument();
  });

  it('without a NOTICE there is no credit', async () => {
    show(details());
    await screen.findByRole('heading', { level: 1, name: 'Immich' });
    expect(screen.queryByText(/Packaged with help/)).toBeNull();
  });
});
