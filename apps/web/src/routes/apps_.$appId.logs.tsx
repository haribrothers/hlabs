import { createFileRoute, redirect } from '@tanstack/react-router';
import { appOverlay } from '../apps/app-overlay';

// An app's logs open over the page they're opened from (D-166). This address (notifications, the tray, older links)
// opens them over Home; `at` opens them at a moment (US-STORE-17), `service` filtered to one container (US-APP-21).
export const Route = createFileRoute('/apps_/$appId/logs')({
  beforeLoad: ({ params, search }) => {
    throw redirect({
      to: '/',
      search: appOverlay({ ...(search as Record<string, unknown>), logs: params.appId }) as never,
      replace: true,
    });
  },
});
