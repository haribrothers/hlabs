// "Quit hlabs" (US-INST-10, D-120): like quitting OrbStack or Docker Desktop, it stops hlabs and every app, after a
// warning. The daemon stops the apps (data untouched) and answers once they're stopped; the background service is
// then stopped and the menu-bar app exits. Opening hlabs again (or logging in) starts it all again. While an update
// or a restore runs, it can't quit: the dialog says to wait.
import { invoke } from '@tauri-apps/api/core';
import { useSyncExternalStore } from 'react';
import { trayCopy as t } from './copy';

let busy = false;
let stopping = false;
const listeners = new Set<() => void>();
const setStopping = (value: boolean) => {
  stopping = value;
  listeners.forEach((l) => l());
};

/** Whether an update or a restore is running (tray.status), for the dialog. */
export function setQuitBusy(value: boolean): void {
  busy = value;
}

/** True while the apps are being stopped: the menu says "Stopping apps…". */
export const useStopping = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => stopping,
  );

const finishFirst = () =>
  invoke('confirm_dialog', { title: t.quitBusyTitle, message: t.quitBusyBody, ok: t.ok, cancel: null }).catch(() => {});

export async function quitTray(): Promise<void> {
  if (stopping) return;
  if (busy) {
    await finishFirst();
    return;
  }
  const confirmed = await invoke<boolean>('confirm_dialog', {
    title: t.quitTitle,
    message: t.quitBody,
    ok: t.quit,
    cancel: t.cancel,
  }).catch(() => false);
  if (!confirmed) return;
  setStopping(true);
  try {
    // Quitting ends the app; coming back means it didn't (or a test), so the menu returns.
    await invoke('quit_hlabs');
    setStopping(false);
  } catch (err) {
    setStopping(false);
    // Something started that can't be interrupted (an update, a restore) between the menu and the dialog.
    if ((err as { hlabsCode?: string } | null)?.hlabsCode === 'JOB_EXCLUSIVE_RUNNING') await finishFirst();
  }
}
