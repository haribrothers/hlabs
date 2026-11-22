import { createFileRoute } from '@tanstack/react-router';
import { StoreUpdatesView } from '../store/updates-view';

export const Route = createFileRoute('/store/updates')({
  component: () => <StoreUpdatesView />,
});
