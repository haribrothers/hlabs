// Starting the background service (US-INST-01), kept by the Rust side: whether this is the first launch, and whether
// the daemon has answered /healthz (`started`) or not within 60 s (`failed`, with /healthz's reason when it gave one).
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useEffect, useState } from 'react';

export interface BootState {
  firstLaunch: boolean;
  step: 'starting' | 'started' | 'failed';
  reason: string | null;
}

export function useBoot(): BootState | null {
  const [boot, setBoot] = useState<BootState | null>(null);
  useEffect(() => {
    let active = true;
    void invoke<BootState>('boot_state').then((b) => active && setBoot(b));
    const unlisten = listen<BootState>('boot-changed', (e) => setBoot(e.payload));
    return () => {
      active = false;
      void unlisten.then((stop) => stop());
    };
  }, []);
  return boot;
}
