import { UiStringsProvider } from '@hlabs/ui';
import { createRootRoute, Outlet } from '@tanstack/react-router';
import { uiStrings } from '../copy/shell';
import { FirstRunGate } from '../onboarding/first-run-gate';
import { Toaster } from '../shell/toaster';

export const Route = createRootRoute({
  component: () => (
    <UiStringsProvider strings={uiStrings}>
      <FirstRunGate>
        <Outlet />
      </FirstRunGate>
      <Toaster />
    </UiStringsProvider>
  ),
});
