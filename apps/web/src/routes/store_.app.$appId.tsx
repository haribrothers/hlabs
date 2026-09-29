import { createFileRoute } from '@tanstack/react-router';
import { AppDetails } from '../store/app-details';

function DetailsPage() {
  const { appId } = Route.useParams();
  return <AppDetails appId={appId} />;
}

export const Route = createFileRoute('/store_/app/$appId')({
  component: DetailsPage,
});
