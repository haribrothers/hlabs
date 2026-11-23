import { createFileRoute, redirect } from '@tanstack/react-router';

// App settings open over the page they're opened from (D-166). This address (older links, bookmarks, the tray) opens
// them over Home.
export const Route = createFileRoute('/apps_/$appId/settings')({
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/', search: { settings: params.appId } as never, replace: true });
  },
});
