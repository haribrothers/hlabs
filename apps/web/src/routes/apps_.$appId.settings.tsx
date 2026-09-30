import { createFileRoute } from '@tanstack/react-router';
import { AppSettings } from '../apps/app-settings';

function AppSettingsPage() {
  const { appId } = Route.useParams();
  return <AppSettings appId={appId} />;
}

// App settings (US-APP-04): outside the app window, so closing it goes back to where it was opened from.
export const Route = createFileRoute('/apps_/$appId/settings')({ component: AppSettingsPage });
