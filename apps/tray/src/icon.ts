// The menu-bar icon follows hlabs's state (US-INST-14): plain while running, a slow pulse while starting (still with
// Reduce motion), half opacity while paused, an accent dot for an update and a red dot when something needs you (the red
// wins). VoiceOver reads "hlabs, <status line>". After 60 s offline one notification says so, until it clears.
import type { TrayStatus } from '@hlabs/api';
import { invoke } from '@tauri-apps/api/core';
import { useEffect, useRef } from 'react';
import type { Access } from './access';
import type { BootState } from './boot';
import { trayCopy as t } from './copy';
import { appsLine } from './format';
import type { DaemonHealth } from './health';

export type IconLook = 'plain' | 'starting' | 'paused' | 'dot';
export interface IconState {
  look: IconLook;
  dot: 'danger' | 'accent' | null;
  /** The status line VoiceOver reads after "hlabs, ". */
  line: string;
  /** Your apps are offline: the engine stopped or hlabs isn't answering. */
  offline: boolean;
}

export const OFFLINE_NOTICE_MS = 60_000;

export function iconFor(s: {
  boot: BootState | null;
  access: Access | null;
  health: DaemonHealth | null;
  status: TrayStatus | null;
  updateAvailable?: boolean;
}): IconState {
  const down = s.health?.state === 'down' || s.boot?.step === 'failed';
  if (down) return { look: 'dot', dot: 'danger', line: t.unreachableStatus, offline: true };
  if (s.access === 'keychainDenied') return { look: 'dot', dot: 'danger', line: t.keychainStatus, offline: false };
  if (s.access === 'unreachable') return { look: 'dot', dot: 'danger', line: t.unreachableStatus, offline: false };
  if (s.health?.state === 'updating') return { look: 'starting', dot: null, line: t.updating, offline: false };
  if (s.health?.state === 'restarting') return { look: 'starting', dot: null, line: t.restarting, offline: false };
  if (s.status?.state === 'engineStopped') return { look: 'dot', dot: 'danger', line: t.engineStopped, offline: true };
  const starting = s.boot?.step === 'starting' || s.health?.state === 'starting' || s.status?.state === 'starting';
  if (starting) {
    const line = s.status ? t.startingApps(s.status.appsRunning, s.status.appsExpected) : t.starting;
    return { look: 'starting', dot: null, line, offline: false };
  }
  if (!s.status) return { look: 'plain', dot: null, line: t.running, offline: false };
  // Other devices can't reach hlabs: another program holds its web port (US-SYS-42).
  if (s.status.portProblem) {
    return { look: 'dot', dot: 'danger', line: t.portInUseStatus(s.status.portProblem.port), offline: false };
  }
  if (s.status.appsNeedAttention > 0) {
    const line = t.runningWithAttention(s.status.appsRunning, s.status.appsExpected, s.status.appsNeedAttention);
    return { look: 'dot', dot: 'danger', line, offline: false };
  }
  if (s.status.paused) return { look: 'paused', dot: null, line: t.paused, offline: false };
  const line = appsLine(s.status.appsRunning, t.runningApps);
  return s.updateAvailable
    ? { look: 'dot', dot: 'accent', line, offline: false }
    : { look: 'plain', dot: null, line, offline: false };
}

const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const prefers = (query: string) => typeof matchMedia === 'function' && matchMedia(query).matches;

export function useMenuBarIcon(state: IconState) {
  const { look, dot, line, offline } = state;
  useEffect(() => {
    void invoke('set_icon', {
      request: {
        look,
        // The design tokens for the dots (09-design-system).
        dot: dot === 'danger' ? token('--danger-fill') : dot === 'accent' ? token('--accent-strong') : null,
        tooltip: `hlabs, ${line}`,
        reduceMotion: prefers('(prefers-reduced-motion: reduce)'),
        dark: prefers('(prefers-color-scheme: dark)'),
      },
    }).catch(() => {});
  }, [look, dot, line]);

  // One notification after 60 s offline, and none again until it has cleared.
  const notified = useRef(false);
  useEffect(() => {
    if (!offline) {
      notified.current = false;
      return;
    }
    if (notified.current) return;
    const timer = setTimeout(() => {
      notified.current = true;
      void invoke('notify', { title: t.offlineTitle, body: t.offlineBody }).catch(() => {});
    }, OFFLINE_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [offline]);
}
