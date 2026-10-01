import { createFileRoute } from '@tanstack/react-router';
import { AppLogs } from '../apps/app-logs';

function AppLogsPage() {
  const { appId } = Route.useParams();
  const { at } = Route.useSearch();
  return <AppLogs appId={appId} at={at} />;
}

// An app's logs (US-APP-08); `at` opens them at a moment, such as an update that failed (US-STORE-17).
export const Route = createFileRoute('/apps_/$appId/logs')({
  component: AppLogsPage,
  validateSearch: (search: Record<string, unknown>): { at?: number } =>
    typeof search.at === 'number' || (typeof search.at === 'string' && /^\d+$/.test(search.at))
      ? { at: Number(search.at) }
      : {},
});
