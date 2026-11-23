import { createFileRoute } from '@tanstack/react-router';
import { AppLogs } from '../apps/app-logs';

function AppLogsPage() {
  const { appId } = Route.useParams();
  const { at, service } = Route.useSearch();
  return <AppLogs appId={appId} at={at} service={service} />;
}

// An app's logs (US-APP-08); `at` opens them at a moment, such as an update that failed (US-STORE-17), `service`
// filtered to one container (from App settings › Usage, US-APP-21).
export const Route = createFileRoute('/apps_/$appId/logs')({
  component: AppLogsPage,
  validateSearch: (search: Record<string, unknown>): { at?: number; service?: string } => ({
    ...(typeof search.at === 'number' || (typeof search.at === 'string' && /^\d+$/.test(search.at))
      ? { at: Number(search.at) }
      : {}),
    ...(typeof search.service === 'string' && search.service ? { service: search.service } : {}),
  }),
});
