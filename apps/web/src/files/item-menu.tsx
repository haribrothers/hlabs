// The right-click menu (US-FILE-21, FilesContextMenu) at the pointer, or under the item for Shift+F10 and the Menu
// key; arrow keys move, Enter chooses, Esc closes and focus goes back to the item. On a phone the same actions open
// from the item's "•••" as a bottom sheet (PhoneFilesActions).
import type { FileEntry } from '@hlabs/api';
import { AppLogo, appTileLook } from '@hlabs/icons';
import { fileKindOf, FileIcon } from '@hlabs/icons/files';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  ModalDialog,
} from '@hlabs/ui';
import type { FileAccent } from '@hlabs/ui/files';
import { useQuery } from '@tanstack/react-query';
import { Fragment, useState } from 'react';
import { createPortal } from 'react-dom';
import { filesCopy as copy } from '../copy/files';
import { appAddress } from '../lib/app-address';
import { useTRPC } from '../lib/trpc';
import { metaOf } from './file-grid';
import type { ItemAction, MenuEntry } from './item-menu-model';

function useOpenWithApps(entry: FileEntry | null) {
  const trpc = useTRPC();
  return (
    useQuery({
      ...trpc.files.openWith.queryOptions({ path: entry?.path ?? '/' }),
      enabled: entry?.kind === 'file',
      retry: false,
    }).data?.apps ?? []
  );
}

export function ItemMenu({
  at,
  entries,
  groups,
  onAction,
  onClose,
}: {
  at: { x: number; y: number };
  entries: FileEntry[];
  groups: MenuEntry[][];
  onAction: (action: ItemAction) => void;
  onClose: () => void;
}) {
  const one = entries.length === 1 ? entries[0]! : null;
  const apps = useOpenWithApps(one);
  return (
    <DropdownMenu open onOpenChange={(open) => (open ? null : onClose())} modal>
      {/* The anchor goes on the page itself: inside the Files window, whose glass (backdrop-filter) makes "fixed"
          relative to the window, the menu opened away from the pointer. */}
      {createPortal(
        <DropdownMenuTrigger asChild>
          <span aria-hidden="true" className="pointer-events-none fixed size-0" style={{ left: at.x, top: at.y }} />
        </DropdownMenuTrigger>,
        document.body,
      )}
      <DropdownMenuContent
        align="start"
        className="min-w-60"
        aria-label={copy.menuFor(entries.length, one?.name ?? '')}
        // Focus goes back to the item, not to the hidden anchor.
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        {groups.map((group, i) => (
          <Fragment key={group[0]!.action}>
            {i > 0 ? <DropdownMenuSeparator /> : null}
            {group.map((m) =>
              m.action === 'openWith' ? (
                <DropdownMenuSub key={m.action}>
                  <DropdownMenuSubTrigger>{m.label}</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="min-w-48">
                    {apps.length ? (
                      apps.map((app) => (
                        <DropdownMenuItem
                          key={app.id}
                          onSelect={() => window.open(appAddress(app.urls), '_blank', 'noopener,noreferrer')}
                        >
                          {app.name}
                        </DropdownMenuItem>
                      ))
                    ) : (
                      <DropdownMenuItem disabled>{copy.noApps}</DropdownMenuItem>
                    )}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              ) : (
                <DropdownMenuItem
                  key={m.action}
                  disabled={m.disabled}
                  danger={m.danger}
                  shortcut={m.hint}
                  onSelect={() => onAction(m.action)}
                >
                  {m.label}
                </DropdownMenuItem>
              ),
            )}
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const ROW =
  'hl-focus flex min-h-12.5 w-full cursor-pointer items-center gap-3 border-0 border-t border-hairline bg-transparent px-4 text-left font-sans text-body first:border-t-0 disabled:cursor-default disabled:opacity-45';
const INK = 'text-ink';

/** A phone's "•••" for one item: its name and size, then the same actions in groups. */
export function ItemSheet({
  entry,
  accent,
  groups,
  onAction,
  onClose,
}: {
  entry: FileEntry;
  accent: FileAccent;
  groups: MenuEntry[][];
  onAction: (action: ItemAction) => void;
  onClose: () => void;
}) {
  const apps = useOpenWithApps(entry);
  const [openWith, setOpenWith] = useState(false);
  const choose = (action: ItemAction) => {
    onClose();
    onAction(action);
  };
  return (
    <ModalDialog open onOpenChange={(open) => (open ? null : onClose())} sheetOnPhone title={entry.name}>
      <div className="flex flex-col gap-3.5">
        <div className="-mt-2 flex items-center gap-3">
          {entry.kind === 'folder' ? (
            <FileIcon folder path={entry.path} accent={accent} size={40} />
          ) : (
            <FileIcon kind={fileKindOf(entry.name, entry.mime)} name={entry.name} mime={entry.mime} size={40} />
          )}
          <span className="text-body-sm text-ink-muted">{metaOf(entry)}</span>
        </div>
        {groups.map((group) => (
          <div key={group[0]!.action} className="overflow-hidden rounded-lg bg-surface-row">
            {group.map((m) =>
              m.action === 'openWith' ? (
                <Fragment key={m.action}>
                  <button
                    type="button"
                    className={`${ROW} ${INK}`}
                    aria-expanded={openWith}
                    onClick={() => setOpenWith((o) => !o)}
                  >
                    <span className="flex-1">{m.label}</span>
                    <span aria-hidden="true" className="text-ink-muted">
                      ›
                    </span>
                  </button>
                  {openWith
                    ? (apps.length ? apps : [null]).map((app) =>
                        app ? (
                          <a
                            key={app.id}
                            href={appAddress(app.urls)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`${ROW} ${INK} pl-8 no-underline`}
                          >
                            <AppLogo
                              decorative
                              name={app.name}
                              src={app.icon.logoUrl}
                              colors={appTileLook(app.name, app.icon, 20).colors}
                              fallbackIcon={appTileLook(app.name, app.icon, 20).fallbackIcon}
                              size={20}
                              radius={6}
                            />
                            {app.name}
                          </a>
                        ) : (
                          <span key="none" className={`${ROW} pl-8 text-ink-muted`}>
                            {copy.noApps}
                          </span>
                        ),
                      )
                    : null}
                </Fragment>
              ) : (
                <button
                  key={m.action}
                  type="button"
                  className={`${ROW} ${m.danger ? 'text-danger' : INK}`}
                  disabled={m.disabled}
                  onClick={() => choose(m.action)}
                >
                  {m.label}
                </button>
              ),
            )}
          </div>
        ))}
      </div>
    </ModalDialog>
  );
}
