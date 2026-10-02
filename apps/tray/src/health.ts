// Whether hlabs answers /healthz, kept by the Rust side (US-INST-13, US-STATE-07): `down` after 10 s without an answer,
// `restarting` after "Restart hlabs", `starting` and `updating` while /healthz says so.
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useCallback, useEffect, useRef, useState } from 'react';
import { COPIED_MS } from './dashboard';

export type DaemonHealth =
  | { state: 'up' }
  | { state: 'starting' }
  | { state: 'updating' }
  | { state: 'restarting' }
  | { state: 'down'; reason: string | null };

export function useHealth(): DaemonHealth | null {
  const [health, setHealth] = useState<DaemonHealth | null>(null);
  useEffect(() => {
    let active = true;
    void invoke<DaemonHealth>('health_state')
      .then((h) => active && setHealth(h))
      .catch(() => {});
    const unlisten = listen<DaemonHealth>('health-changed', (e) => setHealth(e.payload));
    return () => {
      active = false;
      void unlisten.then((stop) => stop()).catch(() => {});
    };
  }, []);
  return health;
}

/** "Restart hlabs", "Show logs" and "Copy diagnostics" while hlabs isn't answering: no API calls. */
export function useDaemonDownActions() {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  const restart = useCallback(() => invoke('restart_daemon').catch(() => {}), []);
  const showLogs = useCallback(() => invoke('show_logs').catch(() => {}), []);
  const copyDiagnostics = useCallback(async () => {
    try {
      await invoke('copy_local_diagnostics');
    } catch {
      return;
    }
    setCopied(true);
    timer.current = setTimeout(() => setCopied(false), COPIED_MS);
  }, []);
  return { restart, showLogs, copyDiagnostics, copied };
}
