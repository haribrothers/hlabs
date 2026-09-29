import { UiStringsProvider } from '@hlabs/ui';
import { createRootRoute, Outlet } from '@tanstack/react-router';
import { uiStrings } from '../copy/shell';
import { ConfirmHost } from '../lib/confirm';
import { HealthGate } from '../health/health-gate';
import { FirstRunGate } from '../onboarding/first-run-gate';
import { Toaster } from '../shell/toaster';

export const Route = createRootRoute({
  component: () => (
    <UiStringsProvider strings={uiStrings}>
      <HealthGate>
        <FirstRunGate>
          <Outlet />
        </FirstRunGate>
      </HealthGate>
      <ConfirmHost />
      <Toaster />
    </UiStringsProvider>
  ),
});
