import { createFileRoute } from '@tanstack/react-router';
import { AppWindow, windowPanel } from '../apps/app-window';

function AppWindowPage() {
  const { appId } = Route.useParams();
  return <AppWindow appId={appId} />;
}

// The app window (US-APP-01): a route, so it survives a page reload. App settings and Logs open over it as dialogs
// (`panel`), so the app keeps its place behind them (D-096); `from` says Logs came from App settings, `at` opens the
// logs at a moment (US-STORE-17).
export const Route = createFileRoute('/apps/$appId')({
  component: AppWindowPage,
  validateSearch: windowPanel,
});
