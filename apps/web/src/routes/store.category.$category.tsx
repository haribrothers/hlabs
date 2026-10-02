import { STORE_CATEGORY_GROUP_IDS, type StoreCategoryGroup } from '@hlabs/shared';
import { createFileRoute, notFound } from '@tanstack/react-router';
import { categoryLabels } from '../copy/store';
import { AppListView } from '../store/app-list-view';

function CategoryPage() {
  const { category } = Route.useParams();
  const id = category as StoreCategoryGroup;
  return <AppListView input={{ category: id }} title={categoryLabels[id]} />;
}

export const Route = createFileRoute('/store/category/$category')({
  beforeLoad: ({ params }) => {
    if (!(STORE_CATEGORY_GROUP_IDS as readonly string[]).includes(params.category)) throw notFound();
  },
  component: CategoryPage,
});
