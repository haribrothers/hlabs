// Where the open folder is (US-FILE-02): "Home › Documents"; each step opens its folder, the last is where you are.
// More than 4 steps fold the middle ones into a "…" menu.
import { ChevronRight, iconDefaults } from '@hlabs/icons';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@hlabs/ui';
import { Link, useNavigate } from '@tanstack/react-router';
import { Fragment } from 'react';
import { filesCopy as copy } from '../copy/files';
import { crumbName } from './places';

export interface Crumb {
  path: string;
  name: string | null;
}

const MAX_SHOWN = 4;

const STEP = 'hl-focus rounded-xs text-title-2 text-ink-muted no-underline hover:text-ink';

/** `phone`: 15px steps in the link colour (PhoneRedesignA_Files). */
export function Breadcrumb({ crumbs, phone = false }: { crumbs: Crumb[]; phone?: boolean }) {
  const step = phone ? 'hl-focus rounded-xs' : STEP;
  const navigate = useNavigate();
  if (!crumbs.length) return null;
  // First, "…" for the middle, and the last two.
  const folded = crumbs.length > MAX_SHOWN ? crumbs.slice(1, crumbs.length - 2) : [];
  const shown: Array<Crumb | 'more'> =
    folded.length > 0 ? [crumbs[0]!, 'more', ...crumbs.slice(crumbs.length - 2)] : crumbs;
  return (
    <nav aria-label={copy.breadcrumb} className={phone ? 'hl-p-crumbs min-w-0' : 'min-w-0'}>
      <ol className={phone ? 'min-w-0' : 'm-0 flex min-w-0 list-none items-center gap-2 p-0'}>
        {shown.map((c, i) => (
          <Fragment key={c === 'more' ? 'more' : c.path}>
            {i > 0 ? (
              <ChevronRight
                aria-hidden
                {...iconDefaults}
                className={phone ? undefined : 'size-4 shrink-0 text-ink-muted'}
              />
            ) : null}
            <li className="min-w-0 truncate">
              {c === 'more' ? (
                <DropdownMenu>
                  <DropdownMenuTrigger className={`${step} border-0 bg-transparent px-1`} aria-label={copy.moreFolders}>
                    …
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="min-w-48">
                    {folded.map((f) => (
                      <DropdownMenuItem
                        key={f.path}
                        onSelect={() => void navigate({ to: '/files', search: { path: f.path } })}
                      >
                        {crumbName(f)}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : i === shown.length - 1 ? (
                <h1 className={phone ? 'truncate' : 'm-0 truncate text-title-2 text-ink'} aria-current="page">
                  {crumbName(c)}
                </h1>
              ) : (
                <Link to="/files" search={{ path: c.path }} className={step}>
                  {crumbName(c)}
                </Link>
              )}
            </li>
          </Fragment>
        ))}
      </ol>
    </nav>
  );
}
