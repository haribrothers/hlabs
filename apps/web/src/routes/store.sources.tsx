import { createFileRoute } from '@tanstack/react-router';
import { StoreSourcesView } from '../store/sources-view';

function SourcesPage() {
  return <StoreSourcesView focusAdd={Route.useSearch().add === true} />;
}

export const Route = createFileRoute('/store/sources')({
  // "Add another app source" opens it with the address field focused (US-STORE-19).
  validateSearch: (search: Record<string, unknown>): { add?: true } => (search.add ? { add: true } : {}),
  component: SourcesPage,
});
