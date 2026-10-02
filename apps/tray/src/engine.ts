// "Start engine" and "Copy diagnostics" in the engine-stopped menu (US-INST-12). Starting runs the same job as the
// dashboard's button; the menu waits for tray.status to say the engine runs, and after 120 s says it didn't start.
import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { COPIED_MS } from './dashboard';
import { daemon } from './daemon';

/** The engine gets as long as in setup and from the dashboard (US-STATE-09). */
export const ENGINE_START_MS = 120_000;

export function useStartEngine(engineRunning: boolean) {
  const [phase, setPhase] = useState<'idle' | 'starting' | 'failed'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clear = () => void (timer.current && clearTimeout(timer.current));
  useEffect(() => clear, []);
  // The engine answers: the menu moves on to Starting by itself.
  useEffect(() => {
    if (engineRunning && phase === 'starting') {
      clear();
      setPhase('idle');
    }
  }, [engineRunning, phase]);

  const start = useCallback(async () => {
    setPhase('starting');
    clear();
    timer.current = setTimeout(() => setPhase('failed'), ENGINE_START_MS);
    try {
      await daemon.mutate('startEngine');
    } catch {
      clear();
      setPhase('failed');
    }
  }, []);
  return { phase, start };
}

export function useCopyDiagnostics() {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  const copy = useCallback(async () => {
    try {
      const { report } = await daemon.query('diagnostics');
      await invoke('copy_text', { text: report });
    } catch {
      return;
    }
    setCopied(true);
    timer.current = setTimeout(() => setCopied(false), COPIED_MS);
  }, []);
  return { copy, copied };
}
