// Settings › Account (US-ACCT-03…): profile, security and devices arrive story by story.
import { LogOutButton } from '../login/log-out-button';
import { Profile } from './profile';
import { Security } from './security';
import { SignedInDevices } from './signed-in-devices';

export function AccountSection() {
  return (
    <div className="flex flex-col gap-6">
      <Profile />
      <Security />
      <SignedInDevices />
      <div>
        <LogOutButton />
      </div>
    </div>
  );
}
