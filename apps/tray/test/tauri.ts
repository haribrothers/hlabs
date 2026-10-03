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
  /** tray.listUsers. */
  users?: unknown[];
  /** check_update: a newer version, null when up to date, 'fail' when the check fails (US-INST-19). */
  update?: { version: string; notes: string | null } | null | 'fail';
  /** apply_update fails (US-INST-20); otherwise it never returns, as the tray relaunches. */
  applyFails?: boolean;
  /** The answer to a native confirm dialog (US-INST-10): true for its OK button. */
  confirm?: boolean;
  /** quit_hlabs: what it does (it never returns when it quits). */
  quit?: () => Promise<unknown>;
  /** tray.useOtherPort finds the other port taken too (US-SYS-42). */
  otherPortTaken?: boolean;
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
      case 'quit_tray':
      case 'open_reset_window':
        return null;
      case 'start_at_login_state':
        return a.startAtLogin ?? true;
      case 'set_start_at_login':
        if (a.loginRefused) throw new Error('blocked');
        return (args as unknown as { enabled: boolean }).enabled;
      case 'open_setup':
        return true;
      case 'confirm_dialog':
        return a.confirm ?? false;
      case 'quit_hlabs':
        return a.quit ? a.quit() : new Promise(() => {});
      case 'apply_update':
        if (a.applyFails) throw new Error('disk full');
        return new Promise(() => {});
      case 'check_update':
        if (a.update === 'fail') throw new Error('offline');
        return a.update ?? null;
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
        if (args?.path === 'tray.listUsers') return { users: a.users ?? [] };
        if (args?.path === 'tray.diagnostics') return { report: 'hlabs diagnostics' };
        if (args?.path === 'tray.useOtherPort') {
          if (a.otherPortTaken) throw { hlabsCode: 'NETWORK_PORT_IN_USE', status: 409 };
          return { ok: true };
        }
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
