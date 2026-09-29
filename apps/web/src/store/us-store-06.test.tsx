// US-STORE-06 · See an app's details before installing.
import type { StoreAppDetails } from '@hlabs/api';
import { storeApp } from '../test/store';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderScreen } from '../test/render';
import { AppDetails, paragraphs, runsAs } from './app-details';
import { details } from '../test/store';

const never = () => new Promise(() => {});

function show(d: StoreAppDetails, installed: unknown[] = []) {
  return renderScreen(() => <AppDetails appId="immich" />, {
    'store.getApp': () => d,
    'apps.list': () => ({ apps: installed }),
    'events.stream': never,
  });
}

describe('US-STORE-06', () => {
  it('shows the logo, name, tagline, category, platform tag, source and Install', async () => {
    show(details());
    expect(await screen.findByRole('heading', { level: 1, name: 'Immich' })).toBeInTheDocument();
    expect(screen.getByText('Photo and video backup from your phone')).toBeInTheDocument();
    for (const tag of ['Files & photos', 'Apple Silicon', 'hlabs official'])
      expect(screen.getByText(tag)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Install' })).toHaveClass('hl-btn-primary');
  });

  it('names another source by its name, and shows Open when installed', async () => {
    show(details({ source: { id: 'x', name: 'Family apps', official: false } }), [
      {
        id: 'immich',
        name: 'Immich',
        state: 'running',
        icon: { logoUrl: null, gradient: null, fallback: null },
        embed: false,
        urls: { local: 'https://immich.hlabs.local', tailnet: null },
      },
    ]);
    expect(await screen.findByText('Family apps')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Open' })).toBeInTheDocument();
  });

  it('the facts: version, what runs, where it opens, what it needs', async () => {
    show(details());
    const list = await screen.findByLabelText('About this app');
    expect(within(list).getByText('3.2.2')).toBeInTheDocument();
    expect(within(list).getByText('3 containers · server, database, cache')).toBeInTheDocument();
    expect(within(list).getByText('immich.hlabs.local')).toBeInTheDocument();
    expect(within(list).getByText('Your Photos folder')).toBeInTheDocument();
    expect(
      runsAs([
        { name: 'app', role: 'server' },
        { name: 'worker', role: null },
      ]),
    ).toBe('2 containers · server, worker');
    expect(runsAs([{ name: 'app', role: 'server' }])).toBe('1 container · server');
  });

  it('About is the description as paragraphs; with no screenshots there is no strip', async () => {
    show(details());
    expect(await screen.findByText('Back up photos and videos from every phone.')).toBeInTheDocument();
    expect(screen.getByText('Share albums with family.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Screenshots' })).toBeNull();
    expect(paragraphs(' a\nb \n\n c ')).toEqual(['a b', 'c']);
  });

  it('a README replaces the description, sanitized: no raw HTML, links open in a new tab', async () => {
    show(
      details({ readme: '# Immich\n\nSee [the docs](https://immich.app).\n\n<script>alert(1)</script><b>bold</b>' }),
    );
    const link = await screen.findByRole('link', { name: 'the docs' });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(document.querySelector('script')).toBeNull();
    expect(screen.queryByText('bold')).toBeNull();
    expect(screen.queryByText(/Back up photos/)).toBeNull();
  });

  it('screenshots open in a viewer that arrow keys move through and Escape closes', async () => {
    show(details({ screenshots: ['/s/1.png', '/s/2.png', '/s/3.png'] }));
    fireEvent.click(await screen.findByRole('button', { name: 'Open screenshot 2' }));
    const dialog = await screen.findByRole('dialog', { name: 'Screenshot 2 of 3' });
    fireEvent.keyDown(within(dialog).getByRole('img'), { key: 'ArrowRight' });
    expect(await screen.findByRole('dialog', { name: 'Screenshot 3 of 3' })).toBeInTheDocument();
    fireEvent.keyDown(within(screen.getByRole('dialog')).getByRole('img'), { key: 'ArrowRight' });
    expect(await screen.findByRole('dialog', { name: 'Screenshot 1 of 3' })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('"What’s new" shows the release notes, with "More" when they run past 6 lines', async () => {
    const height = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight');
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get: () => 500 });
    try {
      show(details({ releaseNotes: 'Line 1\nLine 2' }));
      expect(await screen.findByRole('heading', { name: 'What’s new'.replace('’', "'") })).toBeInTheDocument();
      const more = screen.getByRole('button', { name: 'More' });
      fireEvent.click(more);
      expect(screen.getByRole('button', { name: 'Less' })).toHaveAttribute('aria-expanded', 'true');
    } finally {
      if (height) Object.defineProperty(HTMLElement.prototype, 'scrollHeight', height);
    }
  });

  it('on an arm64 computer, an app without an arm64 image can’t be installed and says why', async () => {
    show(details({ app: storeApp('immich', 'Immich', { arm64: false }) }));
    expect(await screen.findByRole('button', { name: 'Install' })).toBeDisabled();
    expect(screen.getByText("There's no Apple Silicon version of this app yet.")).toBeInTheDocument();
  });
});
