import { MotionConfig } from 'framer-motion';
import type { ReactNode } from 'react';
import { useReduceMotion } from '../lib/motion';

/**
 * Framer Motion follows Reduce motion (US-ACCT-35): `reducedMotion="always"` while it's on, so movement and layout
 * animations are instant and only opacity fades stay; otherwise the person's choice of full motion wins over the
 * device's setting. Put it once around the app.
 */
export function MotionPreference({ children }: { children: ReactNode }) {
  const reduce = useReduceMotion();
  return <MotionConfig reducedMotion={reduce ? 'always' : 'never'}>{children}</MotionConfig>;
}
