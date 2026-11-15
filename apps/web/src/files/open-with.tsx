// Open with (US-FILE-07, FilePreview): the running apps this person can open whose folders hold the file, such as
// Immich for /home/Photos. Each opens the app's home page in a new tab; nothing shows when no app uses the folder.
import { AppLogo, appTileLook } from '@hlabs/icons';
import { useQuery } from '@tanstack/react-query';
import { filesCopy as copy } from '../copy/files';
import { appAddress } from '../lib/app-address';
import { useTRPC } from '../lib/trpc';

const LOGO = 20;

export function OpenWith({ path }: { path: string }) {
  const trpc = useTRPC();
  const apps = useQuery({ ...trpc.files.openWith.queryOptions({ path }), retry: false }).data?.apps ?? [];
  if (!apps.length) return null;
  return (
    <section aria-labelledby="open-with" className="flex flex-col gap-3 border-t border-hairline pt-4">
      <h3 id="open-with" className="m-0 text-headline">
        {copy.openWith}
      </h3>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {apps.map((app) => {
          const look = appTileLook(app.name, app.icon, LOGO);
          return (
            <li key={app.id}>
              <a
                href={appAddress(app.urls)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={copy.openIn(app.name)}
                className="hl-focus flex min-h-11 items-center gap-3 rounded-pill bg-surface-control px-4 text-label text-ink no-underline hover:bg-surface-row"
              >
                <AppLogo
                  decorative
                  name={app.name}
                  src={app.icon.logoUrl}
                  colors={look.colors}
                  fallbackIcon={look.fallbackIcon}
                  size={LOGO}
                  radius={6}
                />
                {app.name}
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
