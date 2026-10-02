// "Open Dashboard" (⌘D) and "Copy dashboard address" (US-INST-06). The Rust side asks tray.quickAction for the current
// address and opens or copies it; after copying, the item says "Copied" for 1.5 s and the menu closes.
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useCallback, useEffect, useRef, useState } from 'react';

export const COPIED_MS = 1_500;

export function useDashboardActions() {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const open = useCallback(() => invoke('open_dashboard').catch(() => {}), []);
  const copy = useCallback(async () => {
    try {
      await invoke('copy_dashboard_address');
    } catch {
      return;
    }
    setCopied(true);
    timer.current = setTimeout(() => {
      setCopied(false);
      void getCurrentWindow().hide();
    }, COPIED_MS);
  }, []);

  // ⌘D opens the dashboard while the menu is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        void open();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return { open, copy, copied };
}
