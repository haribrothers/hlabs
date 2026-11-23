import { MotionPreference, UiStringsProvider } from '@hlabs/ui';
import { createRootRoute, Outlet } from '@tanstack/react-router';
import { uiStrings } from '../copy/shell';
import { ConfirmHost } from '../lib/confirm';
import { HealthGate } from '../health/health-gate';
import { OfflineGate } from '../health/app-offline';
import { FirstRunGate } from '../onboarding/first-run-gate';
import { ConnectionBanner } from '../shell/connection-banner';
import { Toaster } from '../shell/toaster';

export const Route = createRootRoute({
  component: () => (
    <UiStringsProvider strings={uiStrings}>
      {/* Reduce motion everywhere, dialogs and toasts too (US-ACCT-35). */}
      <MotionPreference>
        {/* Opened where hlabs can't be reached at all, from its saved shell (US-INST-29). */}
        <OfflineGate>
          <HealthGate>
            <FirstRunGate>
              <Outlet />
            </FirstRunGate>
            <ConnectionBanner />
          </HealthGate>
          <ConfirmHost />
          <Toaster />
        </OfflineGate>
      </MotionPreference>
    </UiStringsProvider>
  ),
});
