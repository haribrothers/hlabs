// US-INST-14 · Menu-bar icon reflects state.
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { iconFor, OFFLINE_NOTICE_MS } from '../src/icon';
import { Menu } from '../src/menu';
import { answer, emit, reset, tauri } from './tauri';

const started = { firstLaunch: false, step: 'started', reason: null, setupOpened: false } as const;
const status = (over: object = {}) =>
  ({
    state: 'running',
    appsRunning: 11,
    appsExpected: 11,
    appsNeedAttention: 0,
    startupLogAppId: null,
    paused: false,
    engine: { name: 'orbstack', running: true, managedByHlabs: false, canStart: true },
    ...over,
  }) as never;
const base = { boot: started, access: 'ready', health: { state: 'up' } } as const;

describe('US-INST-14 · Menu-bar icon reflects state', () => {
  it('running is the plain icon, read as "hlabs, Running · 11 apps"', () => {
    expect(iconFor({ ...base, status: status() })).toEqual({
      look: 'plain',
      dot: null,
      line: 'Running · 11 apps',
      offline: false,
    });
  });

  it('starting pulses; paused is faded', () => {
    expect(iconFor({ ...base, status: status({ state: 'starting', appsRunning: 4 }) })).toMatchObject({
      look: 'starting',
      line: 'Starting · 4 of 11 apps',
    });
    expect(iconFor({ ...base, status: status({ paused: true }) })).toMatchObject({ look: 'paused' });
  });

  it('an update shows the accent dot', () => {
    expect(iconFor({ ...base, status: status(), updateAvailable: true })).toMatchObject({ look: 'dot', dot: 'accent' });
  });

  it("needs attention, engine stopped and can't reach hlabs show the red dot, which wins over the accent", () => {
    expect(iconFor({ ...base, status: status({ appsNeedAttention: 1 }), updateAvailable: true })).toMatchObject({
      dot: 'danger',
    });
    expect(iconFor({ ...base, status: status({ state: 'engineStopped' }), updateAvailable: true })).toMatchObject({
      dot: 'danger',
      line: 'Container engine stopped',
      offline: true,
    });
    expect(
      iconFor({ ...base, health: { state: 'down', reason: null }, status: null, updateAvailable: true }),
    ).toMatchObject({ dot: 'danger', line: "Can't reach hlabs", offline: true });
  });

  describe('in the tray', () => {
    beforeEach(() => {
      reset();
      answer({ boot: started, status: status() });
    });
    afterEach(() => vi.useRealTimers());

    const iconCalls = () =>
      tauri.invoke.mock.calls.filter(([cmd]) => cmd === 'set_icon').map(([, a]) => (a as { request: unknown }).request);

    it('sets the icon and its VoiceOver text as the state changes', async () => {
      render(<Menu />);
      await vi.waitFor(() =>
        expect(iconCalls().at(-1)).toMatchObject({ look: 'plain', tooltip: 'hlabs, Running · 11 apps' }),
      );
      act(() => emit('health-changed', { state: 'down', reason: null }));
      await vi.waitFor(() =>
        expect(iconCalls().at(-1)).toMatchObject({ look: 'dot', tooltip: "hlabs, Can't reach hlabs" }),
      );
    });

    it('posts one notification after 60 s offline, not again until it clears', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      render(<Menu />);
      await vi.waitFor(() => expect(iconCalls().length).toBeGreaterThan(0));
      const notices = () => tauri.invoke.mock.calls.filter(([cmd]) => cmd === 'notify');
      act(() => emit('health-changed', { state: 'down', reason: null }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(OFFLINE_NOTICE_MS - 1_000);
      });
      expect(notices()).toHaveLength(0);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000);
      });
      expect(notices()).toEqual([['notify', { title: 'hlabs', body: 'Your apps are offline.' }]]);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(OFFLINE_NOTICE_MS * 3);
      });
      expect(notices()).toHaveLength(1);
      // Back, then offline again: a new notice after another 60 s.
      act(() => emit('health-changed', { state: 'up' }));
      act(() => emit('health-changed', { state: 'down', reason: null }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(OFFLINE_NOTICE_MS);
      });
      expect(notices()).toHaveLength(2);
    });
  });
});
