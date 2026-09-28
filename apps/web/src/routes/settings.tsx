import { createFileRoute } from '@tanstack/react-router';
import { areaLabels } from '../copy/shell';
import { LogOutButton } from '../login/log-out-button';
import { AreaWindow } from '../shell/area-window';

// Log out sits here until the Account page (US-ACCT-01 onwards) takes it over.
export const Route = createFileRoute('/settings')({
  component: () => (
    <AreaWindow title={areaLabels.settings}>
      <LogOutButton />
    </AreaWindow>
  ),
});
