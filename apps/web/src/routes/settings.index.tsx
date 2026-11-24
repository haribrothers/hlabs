import { useIsTouchPortrait } from '@hlabs/ui';
import { createFileRoute, Navigate } from '@tanstack/react-router';
import { useIsDesktop } from '../lib/use-media';

// No section in the URL: Account on a desktop; on a phone, or an iPad in portrait, the list of sections comes first
// (US-ACCT-01, 02, US-TAB-05).
export const Route = createFileRoute('/settings/')({
  component: function SettingsIndex() {
    const list = useIsTouchPortrait();
    return useIsDesktop() && !list ? (
      <Navigate to="/settings/$section" params={{ section: 'account' }} replace />
    ) : null;
  },
});
