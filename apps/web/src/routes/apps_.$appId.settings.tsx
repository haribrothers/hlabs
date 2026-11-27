import { createFileRoute, redirect } from '@tanstack/react-router';

// App settings open over the page they're opened from (D-166). This address (older links, bookmarks, the tray) opens
// them over Home, at a public app's Visits with `?view=visits` (US-APP-29).
export const Route = createFileRoute('/apps_/$appId/settings')({
  beforeLoad: ({ params, search }) => {
    const view = (search as Record<string, unknown>).view === 'visits' ? { view: 'visits' } : {};
    throw redirect({ to: '/', search: { settings: params.appId, ...view } as never, replace: true });
  },
});
