import { UiStringsProvider } from '@hlabs/ui';
import { createRootRoute, Outlet } from '@tanstack/react-router';
import { uiStrings } from '../copy/shell';
import { Shell } from '../shell/shell';

export const Route = createRootRoute({
  component: () => (
    <UiStringsProvider strings={uiStrings}>
      <Shell>
        <Outlet />
      </Shell>
    </UiStringsProvider>
  ),
});
