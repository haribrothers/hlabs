// TwoFactorManage by address (US-ACCT-08): Account with the two-factor dialog open. The recovery-code toast after a
// log-in (US-AUTH-09) and required two-factor (US-AUTH-10) link here.
import { createFileRoute } from '@tanstack/react-router';
import { SectionPage } from '../settings/section-page';

export const Route = createFileRoute('/settings/account/two-factor')({
  component: () => <SectionPage id="account" openTwoFactor />,
});
