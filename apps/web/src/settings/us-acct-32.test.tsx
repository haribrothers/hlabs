// US-ACCT-32 · Choose a wallpaper: Dusk, Ocean, Forest and "+ Upload photo", the current one pressed; a pick changes
// the wallpaper at once and is saved; a JPEG, PNG or WebP up to 10 MB becomes "Your own"; anything else says so and
// changes nothing.
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { currentToasts, dismissToast } from '../lib/toasts';
import { setCsrfToken } from '../lib/csrf';
import { wallpaperClass, wallpaperStyle } from '../lib/appearance';
import { renderAppearance, resetRoot } from '../test/appearance';
import { daemonError } from '../test/render';

const WRONG = 'Choose a JPEG, PNG or WebP under 10 MB';
const toastTitles = () => currentToasts().map((t) => t.title);

beforeEach(() => {
  resetRoot();
  for (const t of currentToasts()) dismissToast(t.id);
  setCsrfToken('csrf-1');
});
afterEach(() => {
  vi.unstubAllGlobals();
  setCsrfToken(null);
});

const group = async () => screen.findByRole('group', { name: 'Wallpaper' });
const file = (type: string, size = 1024) => {
  const f = new File(['x'], 'photo', { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
};
const choose = (f: File) => fireEvent.change(screen.getByTestId('wallpaper-file'), { target: { files: [f] } });

describe('US-ACCT-32', () => {
  it('shows Dusk, Ocean, Forest and "+ Upload photo" (Your own); Dusk is pressed by default', async () => {
    renderAppearance();
    const wallpapers = within(await group()).getAllByRole('button');
    expect(wallpapers.map((b) => b.textContent)).toEqual(['Dusk', 'Ocean', 'Forest', '+ Upload photoYour own']);
    expect(within(await group()).getByRole('button', { name: 'Dusk' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(await group()).getByRole('button', { name: 'Ocean' })).toHaveAttribute('aria-pressed', 'false');
    expect(within(await group()).getByRole('button', { name: 'Upload photo' })).toBeInTheDocument();
  });

  it('a thumbnail changes the wallpaper at once and is saved for the account', async () => {
    // The daemon doesn't answer: the page shows the pick anyway.
    const update = vi.fn(() => new Promise(() => {}));
    renderAppearance({}, { 'settings.appearance.update': update });
    fireEvent.click(within(await group()).getByRole('button', { name: 'Ocean' }));
    await waitFor(() => expect(screen.getByTestId('wallpaper')).toHaveClass('hl-wall-ocean'));
    expect(within(await group()).getByRole('button', { name: 'Ocean' })).toHaveAttribute('aria-pressed', 'true');
    expect(update).toHaveBeenCalledWith({ wallpaper: 'ocean' });
    fireEvent.click(within(await group()).getByRole('button', { name: 'Forest' }));
    await waitFor(() => expect(screen.getByTestId('wallpaper')).toHaveClass('hl-wall-forest'));
    expect(update).toHaveBeenLastCalledWith({ wallpaper: 'forest' });
  });

  it('a pick that fails to save goes back and says so', async () => {
    renderAppearance({}, { 'settings.appearance.update': () => Promise.reject(daemonError('INTERNAL')) });
    fireEvent.click(within(await group()).getByRole('button', { name: 'Forest' }));
    await waitFor(() => expect(toastTitles()).toEqual(["Couldn't save that. Try again."]));
    await waitFor(() => expect(screen.getByTestId('wallpaper')).not.toHaveClass('hl-wall-forest'));
  });

  it('a photo is uploaded with the CSRF header, then "Your own" appears and is selected', async () => {
    const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>();
    vi.stubGlobal('fetch', fetchMock);
    const { state } = renderAppearance();
    await group();
    // What the daemon has once the photo is in (auth.me is read again after the upload).
    const after = {
      ...state.appearance,
      wallpaper: 'custom' as const,
      customWallpaperUrl: '/api/appearance/wallpaper?v=7',
    };
    fetchMock.mockImplementation(async () => {
      state.appearance = after;
      return Response.json({ appearance: after });
    });
    const photo = file('image/webp', 3 * 1024 * 1024);
    choose(photo);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/appearance/wallpaper');
    expect(init).toMatchObject({ method: 'POST', body: photo });
    expect(init.headers).toMatchObject({ 'x-hlabs-csrf': 'csrf-1' });
    const own = await within(await group()).findByRole('button', { name: 'Your own' });
    expect(own).toHaveAttribute('aria-pressed', 'true');
    expect(within(await group()).getByRole('button', { name: 'Dusk' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('wallpaper')).toHaveClass('hl-wall-custom');
    expect(screen.getByTestId('wallpaper').style.getPropertyValue('--hl-wall-image')).toBe(
      'url("/api/appearance/wallpaper?v=7")',
    );
    // A new photo can still be chosen.
    expect(within(await group()).getByRole('button', { name: 'Upload photo' })).toHaveTextContent('New photo');
  });

  it('too big, or not a JPEG, PNG or WebP: the error toast, nothing sent, the wallpaper unchanged', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderAppearance({ wallpaper: 'ocean' });
    await group();
    choose(file('image/png', 10 * 1024 * 1024 + 1));
    await waitFor(() => expect(toastTitles()).toEqual([WRONG]));
    for (const t of currentToasts()) dismissToast(t.id);
    choose(file('image/gif'));
    await waitFor(() => expect(toastTitles()).toEqual([WRONG]));
    for (const t of currentToasts()) dismissToast(t.id);
    choose(file('application/pdf'));
    await waitFor(() => expect(toastTitles()).toEqual([WRONG]));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('wallpaper')).toHaveClass('hl-wall-ocean');
  });

  it('a file the daemon refuses by its bytes gets the same toast; the wallpaper stays', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ hlabsCode: 'VALIDATION_FAILED', detail: null }, { status: 400 })),
    );
    renderAppearance();
    await group();
    choose(file('image/jpeg'));
    await waitFor(() => expect(toastTitles()).toEqual([WRONG]));
    expect(screen.getByTestId('wallpaper')).toHaveClass('hl-wall');
    expect(screen.getByTestId('wallpaper')).not.toHaveClass('hl-wall-custom');
  });

  it('draws each wallpaper, and Dusk for their own photo when there is none', () => {
    expect(wallpaperClass({ wallpaper: 'dusk', customWallpaperUrl: null })).toBe('hl-wall');
    expect(wallpaperClass({ wallpaper: 'ocean', customWallpaperUrl: null })).toBe('hl-wall hl-wall-ocean');
    expect(wallpaperClass({ wallpaper: 'forest', customWallpaperUrl: null })).toBe('hl-wall hl-wall-forest');
    expect(wallpaperClass({ wallpaper: 'custom', customWallpaperUrl: null })).toBe('hl-wall');
    expect(wallpaperStyle({ wallpaper: 'custom', customWallpaperUrl: null })).toBeUndefined();
    expect(wallpaperClass({ wallpaper: 'custom', customWallpaperUrl: '/x?v=1' })).toBe('hl-wall hl-wall-custom');
  });
});
