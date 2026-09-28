// TwoFactorManage by address (US-ACCT-08): Account with the two-factor dialog open (or, when it's off, turning it on,
// US-ACCT-12). The recovery-code toast after a log-in (US-AUTH-09) and required two-factor (US-AUTH-10, with `next`)
// link here.
import { createFileRoute } from '@tanstack/react-router';
import { validateLoginSearch } from '../login/search';
import { SectionPage } from '../settings/section-page';

export const Route = createFileRoute('/settings/account/two-factor')({
  validateSearch: (search: Record<string, unknown>) => {
    const { next } = validateLoginSearch(search);
    return next ? { next } : {};
  },
  component: function TwoFactorRoute() {
    return <SectionPage id="account" openTwoFactor next={Route.useSearch().next} />;
  },
});
