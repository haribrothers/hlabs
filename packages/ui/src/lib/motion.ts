// Motion values from docs/design/motion.md, for Framer Motion. CSS uses --hl-dur* and --hl-ease*.
import { useReducedMotion } from 'framer-motion';
import { useSyncExternalStore } from 'react';

export const motion = {
  fast: 120,
  base: 200,
  slow: 320,
  ease: [0.2, 0.8, 0.2, 1] as [number, number, number, number],
  easeIn: [0.4, 0, 1, 1] as [number, number, number, number],
  spring: { type: 'spring' as const, stiffness: 520, damping: 40, mass: 0.9 },
  springSoft: { type: 'spring' as const, stiffness: 300, damping: 30 },
} as const;

function subscribe(onChange: () => void): () => void {
  if (typeof MutationObserver === 'undefined' || typeof document === 'undefined') return () => {};
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion'] });
  return () => observer.disconnect();
}

/** `reduced` or `full` from Settings › Appearance › Reduce motion; null before the dashboard knows. */
const readSetting = () =>
  typeof document === 'undefined' ? null : document.documentElement.getAttribute('data-motion');

/**
 * True when motion should be reduced (US-ACCT-35): Settings › Appearance › Reduce motion, set on <html> as
 * data-motion="reduced" (on) or "full" (off), or the OS setting while there's neither. Swap transforms for fades
 * when it's on.
 */
export function useReduceMotion(): boolean {
  const os = useReducedMotion() ?? false;
  const setting = useSyncExternalStore(subscribe, readSetting, () => null);
  return setting === 'reduced' ? true : setting === 'full' ? false : os;
}
