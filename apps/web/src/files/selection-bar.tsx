// What to do with the selected items (US-FILE-20, FilesList): "<n> selected", Move to…, Share, Download, Move to Trash
// and ✕. On a desktop it's a band under the toolbar; on a phone it takes the tab bar's place while selecting
// (PhoneFilesSelect). Move to… and Move to Trash come with their stories (US-FILE-22, US-FILE-16); Share uses the
// device's share sheet for files and is left out where that can't share files, or when a folder is selected.
import type { FileEntry } from '@hlabs/api';
import { Download, FolderInput, iconDefaults, Share, Trash2, X } from '@hlabs/icons';
import { Button } from '@hlabs/ui';
import { useEffect, type ReactNode } from 'react';
import { filesCopy as copy } from '../copy/files';

/** One file's own link, or a zip of several (US-FILE-05). */
export const downloadUrlOf = (paths: string[]) =>
  `/api/files/download?${paths.map((p) => `path=${encodeURIComponent(p)}`).join('&')}`;

/** The device can share files through its share sheet (Web Share API level 2). */
export const canShareFiles = () => typeof navigator !== 'undefined' && typeof navigator.canShare === 'function';

/** Fetches the files and hands them to the share sheet; a cancelled share is fine. */
export async function shareFiles(entries: FileEntry[]): Promise<void> {
  const files = await Promise.all(
    entries.map(async (e) => {
      const res = await fetch(downloadUrlOf([e.path]), { credentials: 'same-origin' });
      const blob = await res.blob();
      return new File([blob], e.name, { type: e.mime ?? blob.type });
    }),
  );
  if (!navigator.canShare({ files })) throw new Error('unsupported');
  await navigator.share({ files }).catch((err: unknown) => {
    if ((err as { name?: string })?.name !== 'AbortError') throw err;
  });
}

export interface SelectionActions {
  onMove?: () => void;
  onShare?: () => void;
  onTrash?: () => void;
}

export function SelectionBar({
  entries,
  actions,
  onClear,
  onSelectAll,
}: {
  entries: FileEntry[];
  actions: SelectionActions;
  /** ✕: ends selecting (D-137). */
  onClear: () => void;
  onSelectAll?: () => void;
}) {
  const n = entries.length;
  const none = n === 0;
  return (
    <div
      role="toolbar"
      aria-label={copy.selectedLabel(n)}
      className="flex flex-wrap items-center gap-2 rounded-md border border-accent bg-accent-wash py-2 pr-2 pl-4"
    >
      <span className="flex-1 text-body font-semibold">{copy.selected(n)}</span>
      {onSelectAll ? (
        <Button variant="link" size="sm" onClick={onSelectAll}>
          {copy.selectAll}
        </Button>
      ) : null}
      {actions.onMove ? (
        <Button variant="secondary" size="sm" disabled={none} onClick={actions.onMove}>
          {copy.moveTo}
        </Button>
      ) : null}
      {actions.onShare ? (
        <Button variant="secondary" size="sm" onClick={actions.onShare}>
          {copy.share}
        </Button>
      ) : null}
      {none ? (
        <Button variant="secondary" size="sm" disabled>
          {copy.download}
        </Button>
      ) : (
        <Button variant="secondary" size="sm" href={downloadUrlOf(entries.map((e) => e.path))} download>
          {copy.download}
        </Button>
      )}
      {actions.onTrash ? (
        <Button variant="secondary" size="sm" className="text-danger" disabled={none} onClick={actions.onTrash}>
          {copy.moveToTrash}
        </Button>
      ) : null}
      <Button variant="secondary" size="sm" aria-label={copy.clearSelection} onClick={onClear}>
        <X aria-hidden {...iconDefaults} className="size-4" />
      </Button>
    </div>
  );
}

function PhoneAction({
  icon,
  label,
  danger,
  disabled,
  onClick,
  href,
}: {
  icon: ReactNode;
  label: string;
  danger?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  href?: string;
}) {
  const content = (
    <>
      <span className="hl-tab-glyph">{icon}</span>
      <span className="hl-tab-label">{label}</span>
    </>
  );
  return href && !disabled ? (
    <a href={href} download className="hl-tab" data-danger={danger || undefined}>
      {content}
    </a>
  ) : (
    <button type="button" className="hl-tab" data-danger={danger || undefined} disabled={disabled} onClick={onClick}>
      {content}
    </button>
  );
}

/** A phone's selection bar, docked where the tab bar is (PhoneRedesignA_FilesSelect). */
export function PhoneSelectionBar({ entries, actions }: { entries: FileEntry[]; actions: SelectionActions }) {
  const none = entries.length === 0;
  // The tab bar steps aside while this bar is up.
  useEffect(() => {
    document.documentElement.dataset.tabBarHidden = 'true';
    return () => {
      delete document.documentElement.dataset.tabBarHidden;
    };
  }, []);
  return (
    <div className="hl-p-selbar">
      <div role="toolbar" aria-label={copy.selectedLabel(entries.length)} className="hl-tabbar">
        {actions.onMove ? (
          <PhoneAction
            icon={<FolderInput aria-hidden {...iconDefaults} />}
            label={copy.moveShort}
            disabled={none}
            onClick={actions.onMove}
          />
        ) : null}
        {actions.onShare ? (
          <PhoneAction
            icon={<Share aria-hidden {...iconDefaults} />}
            label={copy.share}
            disabled={none}
            onClick={actions.onShare}
          />
        ) : null}
        <PhoneAction
          icon={<Download aria-hidden {...iconDefaults} />}
          label={copy.download}
          disabled={none}
          href={downloadUrlOf(entries.map((e) => e.path))}
        />
        {actions.onTrash ? (
          <PhoneAction
            icon={<Trash2 aria-hidden {...iconDefaults} />}
            label={copy.trashShort}
            danger
            disabled={none}
            onClick={actions.onTrash}
          />
        ) : null}
      </div>
    </div>
  );
}
