// The right-click menu (US-FILE-21, FilesContextMenu) at the pointer, or under the item for Shift+F10 and the Menu
// key; arrow keys move, Enter chooses, Esc closes and focus goes back to the item. On a phone the same actions open
// from the item's "•••" as a bottom sheet (PhoneFilesActions).
import type { FileEntry } from '@hlabs/api';
import {
  AppLogo,
  appTileLook,
  Copy,
  Download,
  Eye,
  FolderInput,
  iconDefaults,
  Link2,
  Pencil,
  Share,
  Trash2,
  type LucideIcon,
} from '@hlabs/icons';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  BottomSheet,
  InsetRow,
  InsetRowButton,
  InsetRowContent,
  insetRowClass,
  SheetHeader,
} from '@hlabs/ui';
import type { FileAccent } from '@hlabs/ui/files';
import { useQuery } from '@tanstack/react-query';
import { Fragment, useState } from 'react';
import { createPortal } from 'react-dom';
import { filesCopy as copy } from '../copy/files';
import { appAddress } from '../lib/app-address';
import { useTRPC } from '../lib/trpc';
import { metaOf } from './file-grid';
import { phoneMetaOf, PhoneItemIcon } from './phone-file-list';
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

const GLYPH: Partial<Record<ItemAction, LucideIcon>> = {
  open: Eye,
  share: Share,
  download: Download,
  copyLink: Link2,
  rename: Pencil,
  move: FolderInput,
  duplicate: Copy,
  trash: Trash2,
};
/** The actions that are tiles at the top of a phone's sheet (PhoneRedesignA_FilesActions). */
const TILES: ItemAction[] = ['open', 'share', 'download'];

/**
 * A phone's "•••" for one item (PhoneRedesignA_FilesActions): its icon, name and size beside "✕", Open, Share and
 * Download as tiles, then the other actions as inset lists with their glyphs, Move to Trash apart in red.
 */
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
  const [now] = useState(() => Date.now());
  const choose = (action: ItemAction) => {
    onClose();
    onAction(action);
  };
  const all = groups.flat();
  const tiles = TILES.map((a) => all.find((m) => m.action === a)).filter((m): m is MenuEntry => !!m);
  const rows = groups.map((g) => g.filter((m) => !TILES.includes(m.action))).filter((g) => g.length > 0);
  const glyph = (action: ItemAction) => {
    const Glyph = GLYPH[action];
    return Glyph ? (
      <span aria-hidden className="hl-p-row-glyph">
        <Glyph {...iconDefaults} />
      </span>
    ) : undefined;
  };
  return (
    <BottomSheet open onOpenChange={(open) => (open ? null : onClose())} titled closeButton={false}>
      <SheetHeader
        leading={<PhoneItemIcon entry={entry} accent={accent} size={40} />}
        title={entry.name}
        subtitle={entry.kind === 'folder' ? metaOf(entry) : phoneMetaOf(entry, now)}
        onClose={onClose}
      />
      <div className="hl-sheet-scroll flex flex-col gap-4 pt-2 pb-6">
        {tiles.length ? (
          <div className="hl-p-actions">
            {tiles.map((m) => {
              const Glyph = GLYPH[m.action]!;
              return (
                <button
                  key={m.action}
                  type="button"
                  className="hl-p-action"
                  disabled={m.disabled}
                  onClick={() => choose(m.action)}
                >
                  <Glyph aria-hidden {...iconDefaults} />
                  {m.label}
                </button>
              );
            })}
          </div>
        ) : null}
        {rows.map((group) => (
          <div key={group[0]!.action} className="hl-p-group">
            {group.map((m) =>
              m.action === 'openWith' ? (
                <Fragment key={m.action}>
                  <InsetRowButton
                    title={m.label}
                    aria-expanded={openWith}
                    chevron
                    onClick={() => setOpenWith((o) => !o)}
                  />
                  {openWith
                    ? (apps.length ? apps : [null]).map((app) =>
                        app ? (
                          <a
                            key={app.id}
                            href={appAddress(app.urls)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={insetRowClass()}
                          >
                            <InsetRowContent
                              leading={
                                <AppLogo
                                  decorative
                                  name={app.name}
                                  src={app.icon.logoUrl}
                                  colors={appTileLook(app.name, app.icon, 24).colors}
                                  fallbackIcon={appTileLook(app.name, app.icon, 24).fallbackIcon}
                                  size={24}
                                  radius={6}
                                />
                              }
                              title={app.name}
                            />
                          </a>
                        ) : (
                          <InsetRow key="none" title={<span className="text-ink-muted">{copy.noApps}</span>} />
                        ),
                      )
                    : null}
                </Fragment>
              ) : (
                <InsetRowButton
                  key={m.action}
                  title={m.label}
                  danger={m.danger}
                  disabled={m.disabled}
                  trailing={glyph(m.action)}
                  onClick={() => choose(m.action)}
                />
              ),
            )}
          </div>
        ))}
      </div>
    </BottomSheet>
  );
}
