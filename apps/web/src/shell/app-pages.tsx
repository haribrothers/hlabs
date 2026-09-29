// The pages the daemon answers with on app hostnames, where the dashboard isn't loaded (US-AUTH-17, US-AUTH-19). They
// are built into the fallback bundle (pages.html) and read their data from the JSON the daemon adds, so they make no
// requests. "Search" on the 404 screen needs the dashboard, so it isn't here.
import { useEffect } from 'react';
import { accessCopy, appPageCopy } from '../copy/settings';

/** What the daemon puts in `<script id="hlabs-page">` (apps/daemon/src/http/static-page.ts). */
export type AppPageData = { kind: 'notFound'; homeUrl: string };

export function readAppPageData(doc: Document = document): AppPageData | null {
  try {
    return JSON.parse(doc.getElementById('hlabs-page')?.textContent ?? 'null') as AppPageData | null;
  } catch {
    return null;
  }
}

function HomeLink({ href }: { href: string }) {
  return (
    <a href={href} className="hl-btn hl-btn-primary hl-btn-lg hl-focus no-underline">
      {accessCopy.goHome}
    </a>
  );
}

export function AppNotFound({ homeUrl }: { homeUrl: string }) {
  useEffect(() => {
    document.title = appPageCopy.notFoundDocTitle;
  }, []);
  return (
    <main className="hl-wall flex min-h-full flex-col items-center justify-center gap-3 px-4 py-10 text-center">
      <p aria-hidden className="m-0 text-display-xl">
        {appPageCopy.notFoundCode}
      </p>
      <h1 className="m-0 text-title-1">{appPageCopy.notFoundTitle}</h1>
      <p className="m-0 max-w-xl text-body text-ink-muted">{appPageCopy.notFoundBody}</p>
      <div className="mt-2">
        <HomeLink href={homeUrl} />
      </div>
    </main>
  );
}

export function AppPage({ data }: { data: AppPageData | null }) {
  // Without data (opened directly), send people Home on this host's dashboard.
  if (!data) return <AppNotFound homeUrl="/" />;
  return <AppNotFound homeUrl={data.homeUrl} />;
}
