// Onboarding pages: centred on the wallpaper, no Dock or tab bar (OnbWelcome and the steps after it).
import { LogoMark } from '@hlabs/icons';
import { GlassCard } from '@hlabs/ui';
import type { ReactNode } from 'react';

export function OnboardingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="hl-wall flex min-h-full flex-col">
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-10 text-center">{children}</main>
    </div>
  );
}

/** The mark inside a 96px glass tile, as on OnbWelcome. */
const LOGO_SIZE = 56;

export function OnboardingLogo() {
  return (
    <GlassCard className="mb-4 grid size-24 place-items-center p-0">
      <LogoMark size={LOGO_SIZE} title="hlabs" />
    </GlassCard>
  );
}
