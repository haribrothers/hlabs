// Settings › Account (US-ACCT-03…): profile, security and devices arrive story by story.
import { LogOutButton } from '../login/log-out-button';

export function AccountSection() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <LogOutButton />
      </div>
    </div>
  );
}
