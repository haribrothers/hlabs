// hlabs as an app on this computer (US-INST-28, US-INST-29, D-126): whether it runs as an installed app, which browser
// this is, and the browser's install prompt (Chrome and Edge fire `beforeinstallprompt` once they'd install it).
// `listenForInstall` runs before React so the prompt isn't missed; the card reads it with `useInstall`.
import { useSyncExternalStore } from 'react';

/** Chrome's install prompt (not in the DOM's types). */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type InstallBrowser = 'chromium' | 'safari' | 'other';

export interface InstallState {
  /** Running as the installed app (its own window). */
  standalone: boolean;
  /** Chrome or Edge offered to install it: the card's "Install hlabs" can open the prompt. */
  canPrompt: boolean;
  /** Installed just now, from the prompt or the browser's own button. */
  installed: boolean;
  browser: InstallBrowser;
}

let prompt: InstallPromptEvent | null = null;
let state: InstallState = { standalone: false, canPrompt: false, installed: false, browser: 'other' };
const listeners = new Set<() => void>();
const set = (next: Partial<InstallState>) => {
  state = { ...state, ...next };
  for (const l of listeners) l();
};

/** Running as an installed app: Chrome, Edge and Safari's Add to Dock all report `standalone` (or a window overlay). */
export function isStandalone(win: Window = window): boolean {
  try {
    // iOS's home-screen app says so on navigator.standalone (US-PHONE-24).
    if ((win.navigator as (Navigator & { standalone?: boolean }) | undefined)?.standalone === true) return true;
    return ['standalone', 'window-controls-overlay', 'minimal-ui'].some(
      (m) => win.matchMedia?.(`(display-mode: ${m})`).matches,
    );
  } catch {
    return false;
  }
}

/** Which install path this browser has: Chrome and Edge prompt; Safari on a Mac has File › Add to Dock. */
export function browserKind(ua: string = navigator.userAgent): InstallBrowser {
  if (/Edg\/|Chrome\/|Chromium\//.test(ua)) return /Firefox|OPR\//.test(ua) ? 'other' : 'chromium';
  if (/Macintosh/.test(ua) && /Safari\//.test(ua) && !/Firefox|FxiOS|CriOS/.test(ua)) return 'safari';
  return 'other';
}

/**
 * Safari on an iPhone or iPad, where "Add to Home Screen" is in the Share sheet (US-PHONE-23). Not Chrome, Firefox or
 * Edge on iOS (CriOS, FxiOS, EdgiOS), which say Safari in their user agent too. iPadOS asks for the desktop site and
 * says "Macintosh", with touch.
 */
export function isIosSafari(ua: string = navigator.userAgent, touchPoints = navigator.maxTouchPoints ?? 0): boolean {
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1);
  return ios && /Safari\//.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(ua);
}

/** Starts listening; call once, before the app renders. */
export function listenForInstall(win: Window = window): void {
  state = { ...state, standalone: isStandalone(win), browser: browserKind(win.navigator.userAgent) };
  win.addEventListener('beforeinstallprompt', (e) => {
    // Kept for the card's button instead of the browser's own mini-infobar.
    e.preventDefault();
    prompt = e as InstallPromptEvent;
    set({ canPrompt: true });
  });
  win.addEventListener('appinstalled', () => {
    prompt = null;
    set({ canPrompt: false, installed: true });
  });
}

/** Opens the browser's install prompt; true when the person installed it. */
export async function promptInstall(): Promise<boolean> {
  if (!prompt) return false;
  const p = prompt;
  prompt = null;
  set({ canPrompt: false });
  await p.prompt();
  const { outcome } = await p.userChoice;
  if (outcome === 'accepted') set({ installed: true });
  return outcome === 'accepted';
}

export function useInstall(): InstallState {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => state,
  );
}

/** Tests: start again from a browser's point of view. */
export function resetInstall(next: Partial<InstallState> = {}, withPrompt: InstallPromptEvent | null = null): void {
  prompt = withPrompt;
  set({ standalone: false, canPrompt: withPrompt !== null, installed: false, browser: 'other', ...next });
}

/**
 * When a new version's service worker takes over a page an older one served (US-PHONE-24), the page reloads once so
 * it runs the new shell. Not on the first install (no worker served the page yet), and only once per page.
 */
export function reloadOnNewShell(
  sw: Pick<ServiceWorkerContainer, 'controller' | 'addEventListener'>,
  reload: () => void = () => window.location.reload(),
): void {
  if (!sw.controller) return;
  let reloaded = false;
  sw.addEventListener('controllerchange', () => {
    if (reloaded) return;
    reloaded = true;
    reload();
  });
}
