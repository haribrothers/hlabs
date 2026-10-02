// The tray's own access to the daemon (US-INST-16), kept by the Rust side: `ready`, `keychainDenied` (the keychain
// refused, so the menu asks for it) or `unreachable` (still rejected after one repair).
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useCallback, useEffect, useState } from 'react';

export type Access = 'ready' | 'keychainDenied' | 'unreachable';

export function useAccess() {
  const [access, setAccess] = useState<Access | null>(null);

  useEffect(() => {
    let active = true;
    void invoke<Access>('tray_access').then((a) => active && setAccess(a));
    const unlisten = listen<Access>('access-changed', (e) => setAccess(e.payload));
    return () => {
      active = false;
      void unlisten.then((stop) => stop());
    };
  }, []);

  const retry = useCallback(async () => setAccess(await invoke<Access>('retry_access')), []);
  return { access, retry };
}
