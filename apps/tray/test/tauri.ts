// A stand-in for the Rust side: answers the window's commands and its tray.* calls, and lets tests send events.
import { vi } from 'vitest';

export interface Answers {
  access?: string;
  boot?: unknown;
  /** tray.setupUrl's url (null once onboarding is complete). */
  setupUrl?: string | null;
  retryAccess?: string;
  /** tray.status's answer. */
  status?: unknown;
  /** The Rust side's health state. */
  health?: unknown;
  /** Whether the OS opens hlabs at login now. */
  startAtLogin?: boolean;
  /** The OS refuses to change it. */
  loginRefused?: boolean;
}

export const tauri = {
  invoke: vi.fn(),
  listeners: new Map<string, (e: { payload: unknown }) => void>(),
};

export function answer(a: Answers) {
  tauri.invoke.mockImplementation(async (cmd: string, args?: { path?: string }) => {
    switch (cmd) {
      case 'tray_access':
        return a.access ?? 'ready';
      case 'retry_access':
        return a.retryAccess ?? 'ready';
      case 'boot_state':
        return a.boot ?? null;
      case 'health_state':
        return a.health ?? { state: 'up' };
      case 'restart_daemon':
      case 'show_logs':
      case 'copy_local_diagnostics':
      case 'set_icon':
      case 'notify':
        return null;
      case 'start_at_login_state':
        return a.startAtLogin ?? true;
      case 'set_start_at_login':
        if (a.loginRefused) throw new Error('blocked');
        return (args as unknown as { enabled: boolean }).enabled;
      case 'open_setup':
        return true;
      case 'open_dashboard':
      case 'copy_dashboard_address':
      case 'copy_text':
        return null;
      case 'daemon_call':
        if (args?.path === 'tray.setupUrl') return { url: a.setupUrl ?? null, lanUrls: [] };
        if (args?.path === 'tray.status') return a.status ?? null;
        if (args?.path === 'tray.startEngine') return { jobId: 'job1' };
        if (args?.path === 'tray.quickAction') return { jobId: 'job2' };
        if (args?.path === 'tray.setStartAtLogin') return { ok: true };
        if (args?.path === 'tray.diagnostics') return { report: 'hlabs diagnostics' };
        return null;
      default:
        throw new Error(`unexpected command ${cmd}`);
    }
  });
}

export function emit(name: string, payload: unknown) {
  tauri.listeners.get(name)?.({ payload });
}

export function reset() {
  tauri.invoke.mockReset();
  tauri.listeners.clear();
}
