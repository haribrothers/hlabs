import { createFileRoute } from '@tanstack/react-router';
import { AppWindow } from '../apps/app-window';

function AppWindowPage() {
  const { appId } = Route.useParams();
  return <AppWindow appId={appId} />;
}

// The app window (US-APP-01): a route, so it survives a page reload.
export const Route = createFileRoute('/apps/$appId')({ component: AppWindowPage });
