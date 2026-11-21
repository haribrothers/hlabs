// What the right-click menu offers (US-FILE-21, FilesContextMenu), grouped as drawn: Open and Open with; Share…, Copy
// link and Download; Rename…, Move to… and Duplicate; Move to Trash. Several items leave out Open, Open with, Copy
// link and Rename…; a read-only place turns Rename…, Move to…, Duplicate and Move to Trash off. Pure, for tests.
import type { FileEntry } from '@hlabs/api';
import { filesCopy as copy } from '../copy/files';

export type ItemAction =
  'open' | 'openWith' | 'share' | 'copyLink' | 'download' | 'rename' | 'move' | 'duplicate' | 'trash';

export interface MenuEntry {
  action: ItemAction;
  label: string;
  /** The key that does it, shown on the right ("↵", "⌫"). */
  hint?: string;
  disabled?: boolean;
  danger?: boolean;
}

export interface MenuContext {
  entries: FileEntry[];
  readOnly: boolean;
  /** The device's share sheet takes files (folders wait for network shares, phase 8). */
  canShareFiles: boolean;
  /** Stories that have shipped (D-036). */
  can: { rename: boolean; move: boolean; trash: boolean };
}

export function itemMenu(ctx: MenuContext): MenuEntry[][] {
  const one = ctx.entries.length === 1 ? ctx.entries[0]! : null;
  const allFiles = ctx.entries.every((e) => e.kind === 'file');
  const groups: MenuEntry[][] = [
    one
      ? [
          { action: 'open', label: copy.open, hint: '↵' },
          ...(one.kind === 'file' ? [{ action: 'openWith' as const, label: copy.openWith }] : []),
        ]
      : [],
    [
      ...(ctx.canShareFiles && allFiles ? [{ action: 'share' as const, label: copy.shareItem }] : []),
      ...(one ? [{ action: 'copyLink' as const, label: copy.copyLink }] : []),
      { action: 'download', label: copy.download },
    ],
    [
      ...(one && ctx.can.rename ? [{ action: 'rename' as const, label: copy.renameItem, disabled: ctx.readOnly }] : []),
      ...(ctx.can.move ? [{ action: 'move' as const, label: copy.moveTo, disabled: ctx.readOnly }] : []),
      { action: 'duplicate', label: copy.duplicate, disabled: ctx.readOnly },
    ],
    ctx.can.trash
      ? [{ action: 'trash', label: copy.moveToTrash, hint: '⌫', danger: true, disabled: ctx.readOnly }]
      : [],
  ];
  return groups.filter((g) => g.length > 0);
}
