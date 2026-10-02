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
      case 'open_setup':
        return true;
      case 'daemon_call':
        if (args?.path === 'tray.setupUrl') return { url: a.setupUrl ?? null, lanUrls: [] };
        if (args?.path === 'tray.status') return a.status ?? null;
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
