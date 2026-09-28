// Settings › Account (US-ACCT-03…12): profile, security (password, two-factor, recovery codes) and devices.
// `/settings/account/two-factor` opens it with TwoFactorManage showing.
import { useNavigate } from '@tanstack/react-router';
import { LogOutButton } from '../login/log-out-button';
import { Profile } from './profile';
import { Security } from './security';
import { SignedInDevices } from './signed-in-devices';

export function AccountSection({ openTwoFactor = false }: { openTwoFactor?: boolean }) {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col gap-6">
      <Profile />
      <Security
        openTwoFactor={openTwoFactor}
        // Closing the dialog opened by its address goes back to plain Account.
        onTwoFactorClosed={
          openTwoFactor ? () => void navigate({ to: '/settings/$section', params: { section: 'account' } }) : undefined
        }
      />
      <SignedInDevices />
      <div>
        <LogOutButton />
      </div>
    </div>
  );
}
