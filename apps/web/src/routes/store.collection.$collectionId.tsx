import { createFileRoute } from '@tanstack/react-router';
import { AppListView } from '../store/app-list-view';

function CollectionPage() {
  const { collectionId } = Route.useParams();
  return <AppListView input={{ collection: collectionId }} />;
}

export const Route = createFileRoute('/store/collection/$collectionId')({
  component: CollectionPage,
});
