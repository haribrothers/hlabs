import { createFileRoute, Navigate } from '@tanstack/react-router';
import { useIsDesktop } from '../lib/use-media';

// No section in the URL: Account on a desktop; on a phone the list of sections comes first (US-ACCT-01, 02).
export const Route = createFileRoute('/settings/')({
  component: function SettingsIndex() {
    return useIsDesktop() ? <Navigate to="/settings/$section" params={{ section: 'account' }} replace /> : null;
  },
});
