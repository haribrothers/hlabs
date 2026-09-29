// The pages the daemon answers with on app hostnames, where the dashboard isn't loaded (US-AUTH-17, US-AUTH-19). They
// are built into the fallback bundle (pages.html) and read their data from the JSON the daemon adds, so they make no
// requests. "Search" on the 404 screen needs the dashboard, so it isn't here. The "no access" page matches the dashboard's
// (AccessDenied) with the app and who to ask.
import { Lock, iconDefaults } from '@hlabs/icons';
import { Avatar, avatarColorFor, GlassCard } from '@hlabs/ui';
import { useEffect } from 'react';
import { accessCopy, appPageCopy } from '../copy/settings';

export interface NoAccessData {
  kind: 'noAccess';
  homeUrl: string;
  appName: string;
  adminName: string | null;
  username: string;
  displayName: string;
  avatarColor: string | null;
  accent: string;
}

/** What the daemon puts in `<script id="hlabs-page">` (apps/daemon/src/http/static-page.ts). */
export type AppPageData = { kind: 'notFound'; homeUrl: string } | NoAccessData;

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

/** "You don't have access to this" for an app that isn't shared with a member (US-AUTH-19, US-STATE-20). */
export function AppNoAccess({ data }: { data: NoAccessData }) {
  useEffect(() => {
    document.title = accessCopy.noAccessDocTitle;
    document.documentElement.dataset.accent = data.accent;
  }, [data.accent]);
  return (
    <main className="hl-wall flex min-h-full items-center justify-center px-4 py-10">
      <GlassCard level={2} className="flex w-full max-w-xl flex-col items-center gap-4 p-7 text-center">
        <span className="grid size-16 place-items-center rounded-pill bg-surface-control">
          <Lock aria-hidden {...iconDefaults} />
        </span>
        <h1 className="m-0 text-title-1">{accessCopy.noAccessTitle}</h1>
        <p className="m-0 text-body text-ink-muted">{appPageCopy.noAccessBody(data.appName, data.adminName)}</p>
        <div className="flex w-full items-center gap-3 rounded-md bg-surface-control p-3 text-left">
          <Avatar name={data.displayName} color={avatarColorFor(data.username, data.avatarColor)} size="md" />
          <span className="flex min-w-0 flex-col">
            <span className="text-body-sm font-semibold">{accessCopy.signedInAs(data.username)}</span>
            <span className="text-caption text-ink-muted">{appPageCopy.member}</span>
          </span>
        </div>
        <HomeLink href={data.homeUrl} />
      </GlassCard>
    </main>
  );
}

export function AppPage({ data }: { data: AppPageData | null }) {
  // Without data (opened directly), send people Home on this host's dashboard.
  if (!data) return <AppNotFound homeUrl="/" />;
  if (data.kind === 'noAccess') return <AppNoAccess data={data} />;
  return <AppNotFound homeUrl={data.homeUrl} />;
}
