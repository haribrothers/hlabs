// Moving around the store (US-STORE-02): Discover and every category with apps, in the daemon's fixed order; on a
// phone the same as a row of chips. Admins also get "Manage apps" (Updates with its count, App sources, Deploy your
// own app), each hidden until its phase ships (D-036): in phase 2 none has, so the group isn't shown.
import type { StoreCategoryGroup } from '@hlabs/shared';
import { isFeatureEnabled, type Feature } from '@hlabs/shared';
import { Badge, Menu } from '@hlabs/ui';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { categoryLabels, storeCopy } from '../copy/store';
import { useTRPC } from '../lib/trpc';
import { useMe } from '../lib/use-me';

const copy = storeCopy;

interface ManageItem {
  id: 'updates' | 'sources' | 'deploy';
  label: string;
  path: string;
  feature: Feature;
}

const MANAGE: ManageItem[] = [
  { id: 'updates', label: copy.updates, path: '/store/updates', feature: 'appUpdates' },
  { id: 'sources', label: copy.appSources, path: '/store/sources', feature: 'storeSources' },
  { id: 'deploy', label: copy.deployCustom, path: '/store/deploy', feature: 'deployCustom' },
];

/** The "Manage apps" items an admin sees in this build. */
export function manageItems(role: 'admin' | 'member' | undefined, shippedPhase?: number): ManageItem[] {
  if (role !== 'admin') return [];
  return MANAGE.filter((i) => isFeatureEnabled(i.feature, shippedPhase));
}

export function useCategories() {
  const trpc = useTRPC();
  return useQuery({ ...trpc.store.listCategories.queryOptions(), retry: false });
}

type NavLinkProps = { className: string; children: ReactNode };

function DiscoverLink({ className, children }: NavLinkProps) {
  return (
    <Link to="/store" activeOptions={{ exact: true }} className={className} activeProps={{ 'aria-current': 'page' }}>
      {children}
    </Link>
  );
}

function CategoryLink({ id, className, children }: NavLinkProps & { id: StoreCategoryGroup }) {
  return (
    <Link
      to="/store/category/$category"
      params={{ category: id }}
      className={className}
      activeProps={{ 'aria-current': 'page' }}
    >
      {children}
    </Link>
  );
}

const sideItem =
  'hl-focus flex min-h-11 items-center justify-between rounded-md px-3 text-body text-ink no-underline hover:bg-surface-row aria-[current=page]:bg-surface-control';

/** The desktop sidebar's lists. */
export function StoreSidebar() {
  const categories = useCategories().data?.categories ?? [];
  const manage = manageItems(useMe().data?.role);
  return (
    <div className="flex flex-col gap-6">
      <nav aria-label={copy.categories}>
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          <li>
            <DiscoverLink className={sideItem}>{copy.discover}</DiscoverLink>
          </li>
          {categories.map((c) => (
            <li key={c.id}>
              <CategoryLink id={c.id} className={sideItem}>
                {categoryLabels[c.id]}
              </CategoryLink>
            </li>
          ))}
        </ul>
      </nav>
      {manage.length ? (
        <nav aria-label={copy.manageApps} className="border-t border-hairline pt-4">
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {manage.map((item) => (
              <li key={item.id}>
                <a href={item.path} className={sideItem}>
                  {item.label}
                  {item.id === 'updates' ? <UpdatesBadge /> : null}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </div>
  );
}

/** The pending updates count (phase 7, US-STORE-15). */
function UpdatesBadge() {
  const trpc = useTRPC();
  const updates = useQuery({ ...trpc.store.listUpdates.queryOptions(), retry: false });
  const count = (updates.data as { pending?: unknown[] } | undefined)?.pending?.length ?? 0;
  return count > 0 ? <Badge tone="accent">{count}</Badge> : null;
}

const chip =
  'hl-focus inline-flex min-h-11 shrink-0 items-center rounded-pill bg-surface-row px-4 text-body-sm text-ink no-underline aria-[current=page]:bg-surface-control aria-[current=page]:font-semibold';

/** The phone's categories: a row of chips that scrolls sideways, and "Manage apps" in a menu. */
export function StoreChips() {
  const categories = useCategories().data?.categories ?? [];
  const manage = manageItems(useMe().data?.role);
  return (
    <div className="flex items-center gap-2">
      <nav aria-label={copy.categories} className="-mx-4 min-w-0 flex-1 overflow-x-auto px-4">
        <ul className="m-0 flex w-max list-none gap-2 p-0">
          <li>
            <DiscoverLink className={chip}>{copy.discover}</DiscoverLink>
          </li>
          {categories.map((c) => (
            <li key={c.id}>
              <CategoryLink id={c.id} className={chip}>
                {categoryLabels[c.id]}
              </CategoryLink>
            </li>
          ))}
        </ul>
      </nav>
      {manage.length ? (
        <Menu label={copy.manageApps} items={manage.map((i) => ({ label: i.label, href: i.path }))} />
      ) : null}
    </div>
  );
}
