import { createFileRoute } from '@tanstack/react-router';
import { AppDetails } from '../store/app-details';

function DetailsPage() {
  const { appId } = Route.useParams();
  return <AppDetails appId={appId} />;
}

export const Route = createFileRoute('/store_/app/$appId')({
  // `install` opens the install sheet (US-STORE-08).
  validateSearch: (search: Record<string, unknown>): { install?: true } =>
    search.install === true || search.install === 'true' ? { install: true } : {},
  component: DetailsPage,
});
