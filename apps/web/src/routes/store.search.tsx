import { createFileRoute } from '@tanstack/react-router';
import { storeCopy } from '../copy/store';
import { AppListView } from '../store/app-list-view';
import { cleanQuery } from '../store/search';

function SearchPage() {
  const q = cleanQuery(Route.useSearch().q);
  return <AppListView input={{ query: q }} title={storeCopy.resultsFor(q)} empty={storeCopy.noResults(q)} />;
}

export const Route = createFileRoute('/store/search')({
  validateSearch: (search: Record<string, unknown>) => ({ q: typeof search.q === 'string' ? search.q : '' }),
  component: SearchPage,
});
