// App details (US-STORE-06, US-STORE-07). Until that story: the app's name and a way back.
import { Link } from '@tanstack/react-router';
import { GlassCard } from '@hlabs/ui';
import { storeCopy } from '../copy/store';

export function AppDetails({ appId }: { appId: string }) {
  return (
    <GlassCard level={2} className="mx-auto flex w-full max-w-window flex-col gap-4 p-7">
      <Link to="/store" className="hl-focus self-start rounded-xs text-body-sm text-ink-muted no-underline">
        {storeCopy.title}
      </Link>
      <h1 className="m-0 text-title-1">{appId}</h1>
    </GlassCard>
  );
}
