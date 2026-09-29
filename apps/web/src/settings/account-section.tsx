// Settings › Account (US-ACCT-03…12): profile, security (password, two-factor, recovery codes) and devices.
// `/settings/account/two-factor` opens it with TwoFactorManage showing.
import { safeNext } from '@hlabs/shared';
import { useNavigate } from '@tanstack/react-router';
import { LogOutButton } from '../login/log-out-button';
import { Profile } from './profile';
import { Security } from './security';
import { SignedInDevices } from './signed-in-devices';

export function AccountSection({ openTwoFactor = false, next }: { openTwoFactor?: boolean; next?: string }) {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col gap-6">
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
