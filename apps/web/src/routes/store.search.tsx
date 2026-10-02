import { createFileRoute } from '@tanstack/react-router';
import { cleanQuery } from '../store/search';
import { SearchResults } from '../store/search-results';

function SearchPage() {
  return <SearchResults query={cleanQuery(Route.useSearch().q)} />;
}

export const Route = createFileRoute('/store/search')({
  validateSearch: (search: Record<string, unknown>) => ({ q: typeof search.q === 'string' ? search.q : '' }),
  component: SearchPage,
});
