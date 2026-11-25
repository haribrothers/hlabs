// Setup, invites and reset links on the dashboard's public address (US-SYS-46; D-182, 07 §7.11 control 6): never
// served there. The page says "Open this at home or on your tailnet." instead (the daemon refuses their calls anyway).
import { House, iconDefaults } from '@hlabs/icons';
import { GlassCard } from '@hlabs/ui';
import { useEffect } from 'react';
import { publicDashboardCopy as copy } from '../copy/public-dashboard';
import { LoginLayout } from './login-layout';

export function NotOnPublicAddress() {
  useEffect(() => {
    document.title = 'hlabs';
  }, []);
  return (
    <LoginLayout>
      <GlassCard level={2} className="flex w-full max-w-[480px] flex-col items-start gap-4 p-10 text-left">
        <span className="grid size-12 place-items-center rounded-md bg-surface-control text-ink">
          <House aria-hidden {...iconDefaults} />
        </span>
        <h1 className="m-0 text-title-1">{copy.notHereTitle}</h1>
        <p className="m-0 text-body text-ink-muted">{copy.notHereBody}</p>
      </GlassCard>
    </LoginLayout>
  );
}
