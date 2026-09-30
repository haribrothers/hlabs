import { createFileRoute } from '@tanstack/react-router';
import { AppLogs } from '../apps/app-logs';

function AppLogsPage() {
  const { appId } = Route.useParams();
  return <AppLogs appId={appId} />;
}

// An app's logs (US-APP-08).
export const Route = createFileRoute('/apps_/$appId/logs')({ component: AppLogsPage });
