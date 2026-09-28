import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAppearance, wallpaperClass, type Appearance } from '../lib/appearance';
import { renderScreen } from '../test/render';
import { greetingFor } from './greeting';
import { HomeView } from './home-view';

const APPEARANCE: Appearance = {
  wallpaper: 'dusk',
  accent: 'violet',
  reduceTransparency: false,
  reduceMotion: false,
  showWidgets: true,
  showGreeting: true,
};
const me =
  (displayName = 'Hari', appearance: Partial<Appearance> = {}) =>
  () => ({
    id: 'u1',
    username: 'hari',
    displayName,
    role: 'admin',
    avatarColor: 'violet',
    locale: 'en',
    mustSetupTotp: false,
    totpEnabled: false,
    remember: false,
    appearance: { ...APPEARANCE, ...appearance },
    csrfToken: 't',
  });

const at = (h: number, m: number) => new Date(2026, 8, 28, h, m);

afterEach(() => vi.useRealTimers());

describe('US-HOME-01', () => {
  it('greets by local time: morning 05:00–11:59, afternoon 12:00–17:59, evening 18:00–04:59', () => {
    expect(greetingFor(at(4, 59))).toBe('evening');
    expect(greetingFor(at(5, 0))).toBe('morning');
    expect(greetingFor(at(11, 59))).toBe('morning');
    expect(greetingFor(at(12, 0))).toBe('afternoon');
    expect(greetingFor(at(17, 59))).toBe('afternoon');
    expect(greetingFor(at(18, 0))).toBe('evening');
  });

  it('greets by name, sets the title, and changes greeting when the minute crosses a boundary', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: at(11, 59) });
    renderScreen(HomeView, { 'auth.me': me() });
    expect(await screen.findByRole('heading', { level: 1, name: 'Good morning, Hari' })).toBeInTheDocument();
    expect(document.title).toBe('hlabs — Home');
    await act(async () => vi.advanceTimersByTime(60_000));
    expect(screen.getByRole('heading', { level: 1, name: 'Good afternoon, Hari' })).toBeInTheDocument();
  });

  it('uses the username when the display name is missing', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: at(20, 0) });
    renderScreen(HomeView, { 'auth.me': me('  ') });
    expect(await screen.findByRole('heading', { level: 1, name: 'Good evening, hari' })).toBeInTheDocument();
  });

  it('applies the accent (and reduce motion) on the page, and draws Dusk for any unknown wallpaper', () => {
    function Probe({ appearance }: { appearance: Appearance }) {
      useAppearance(appearance);
      return null;
    }
    const { rerender } = render(<Probe appearance={APPEARANCE} />);
    expect(document.documentElement.dataset.accent).toBe('violet');
    rerender(<Probe appearance={{ ...APPEARANCE, accent: 'mint', reduceMotion: true }} />);
    expect(document.documentElement.dataset.accent).toBe('mint');
    expect(document.documentElement.dataset.reduceMotion).toBe('true');
    expect(wallpaperClass('dusk')).toBe('hl-wall');
    expect(wallpaperClass('aurora')).toBe('hl-wall');
  });
});
