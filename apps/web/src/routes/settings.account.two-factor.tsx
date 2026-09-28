// TwoFactorManage: its screen arrives with US-ACCT-08; until then the link from a recovery-code log-in (US-AUTH-09)
// opens Settings.
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/settings/account/two-factor')({
  component: () => null,
});
