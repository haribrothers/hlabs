// Settings › Account (US-ACCT-03…12, US-ACCT-27): profile, security (password, two-factor, recovery codes) and devices;
// members first see who manages the rest.
// `/settings/account/two-factor` opens it with TwoFactorManage showing.
import { safeNext } from '@hlabs/shared';
import { GlassCard } from '@hlabs/ui';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { accountCopy } from '../copy/account';
import { useTRPC } from '../lib/trpc';
import { useMe } from '../lib/use-me';
import { LogOutButton } from '../login/log-out-button';
import { Profile } from './profile';
import { Security } from './security';
import { SignedInDevices } from './signed-in-devices';

/** For members, above their account: who looks after everything else (US-ACCT-27). */
function ManagedByNote() {
  const trpc = useTRPC();
  const me = useMe().data;
  const account = useQuery({ ...trpc.account.get.queryOptions(), enabled: me?.role === 'member', retry: false });
  if (me?.role !== 'member' || !account.data) return null;
  const admin = account.data.adminName;
  return (
    <GlassCard level={1} className="px-4 py-3">
      <p className="m-0 text-body-sm text-ink-muted">
        {admin ? accountCopy.managedBy(admin) : accountCopy.managedByAdmin}
      </p>
    </GlassCard>
  );
}

export function AccountSection({ openTwoFactor = false, next }: { openTwoFactor?: boolean; next?: string }) {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col gap-6">
      <ManagedByNote />
      <Profile />
      <Security
        openTwoFactor={openTwoFactor}
        // Closing the dialog opened by its address goes back to plain Account, or on to where this person was going
        // when they were sent to set up required two-factor (US-AUTH-10).
        onTwoFactorClosed={
          openTwoFactor
            ? () =>
                void (next
                  ? navigate({ href: safeNext(next) })
                  : navigate({ to: '/settings/$section', params: { section: 'account' } }))
            : undefined
        }
      />
      <SignedInDevices />
      <div>
        <LogOutButton />
      </div>
    </div>
  );
}
