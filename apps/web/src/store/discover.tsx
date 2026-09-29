// The store home (US-STORE-01): "Featured" cards, then the curated rows, each with "See all".
import { Link } from '@tanstack/react-router';
import { storeCopy, tagLabels } from '../copy/store';
import { AppCard, FeaturedCard } from './cards';
import { StoreView } from './store-layout';
import { useInstalls } from './use-installs';
import { useStoreHome } from './use-store-home';

const copy = storeCopy;

export function Discover() {
  const home = useStoreHome();
  const installs = useInstalls();
  if (!home.data) return null;
  const { host, featured, collections } = home.data;
  return (
    <StoreView title={copy.discover} phoneTitle={false}>
      <div className="flex flex-col gap-8 pb-6">
        {featured.length ? (
          <section aria-labelledby="store-featured" className="flex flex-col gap-4">
            <h3 id="store-featured" className="sr-only">
              {copy.featured}
            </h3>
            <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 lg:grid-cols-2">
              {featured.map((app) => (
                <li key={app.id}>
                  <FeaturedCard
                    app={app}
                    host={host}
                    installs={installs}
                    eyebrow={app.tags.map((t) => tagLabels[t]).find(Boolean) ?? copy.featured}
                  />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {collections.map((row) => {
          const title = row.title || copy.allApps;
          const headingId = `store-row-${row.id}`;
          return (
            <section key={row.id} aria-labelledby={headingId} className="flex flex-col gap-4">
              <div className="flex items-baseline justify-between gap-4">
                <h3 id={headingId} className="m-0 text-title-2 font-bold">
                  {title}
                </h3>
                <Link
                  to="/store/collection/$collectionId"
                  params={{ collectionId: row.id }}
                  className="hl-focus rounded-xs text-body-sm text-ink-muted no-underline hover:text-ink"
                  aria-label={copy.seeAllOf(title)}
                >
                  {copy.seeAll}
                </Link>
              </div>
              <ul aria-label={title} className="m-0 grid list-none grid-cols-1 gap-4 p-0 md:grid-cols-2 xl:grid-cols-3">
                {row.apps.map((app) => (
                  <li key={app.id}>
                    <AppCard app={app} host={host} installs={installs} />
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </StoreView>
  );
}
