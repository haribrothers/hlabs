// Files only (D-053): imports the Papirus icon data, so it lives on the @hlabs/ui/files entry.
import { Share2 } from '@hlabs/icons';
import { FileIcon, fileKindOf, type FileKind, type FolderKind } from '@hlabs/icons/files';
import { useState, type MouseEvent } from 'react';
import { cn } from '../lib/cn';
import { useUiStrings } from '../lib/strings';

export type FileAccent = 'violet' | 'mint' | 'amber' | 'rose';

export interface FileItemProps {
  name: string;
  /** 'folder' for folders; for files leave it out to pick the kind from name/mime. */
  kind?: 'folder' | FileKind;
  mime?: string | null;
  /** Virtual path; picks special folder icons (Documents, Photos …). */
  path?: string;
  folderKind?: FolderKind;
  accent?: FileAccent;
  /** "24 items" for folders, the size for files. */
  meta?: string;
  /** List view only. */
  modified?: string;
  /** Photos and videos: shown instead of the icon once loaded. */
  thumbnail?: string;
  view?: 'grid' | 'list';
  selected?: boolean;
  shared?: boolean;
  href?: string;
  role?: string;
  onClick?: (e: MouseEvent) => void;
  onOpen?: () => void;
  onContextMenu?: (e: MouseEvent) => void;
}

const GRID_ICON = 72;
const LIST_ICON = 24;
const THUMB_KINDS = new Set<FileKind>(['image', 'video']);

function Glyph({ item, list }: { item: FileItemProps; list: boolean }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const size = list ? LIST_ICON : GRID_ICON;
  const isFolder = item.kind === 'folder' || item.folderKind !== undefined;
  const fileKind = !isFolder ? ((item.kind as FileKind | undefined) ?? fileKindOf(item.name, item.mime)) : undefined;
  const icon = isFolder ? (
    <FileIcon
      folder={item.folderKind ?? (item.path ? true : 'plain')}
      path={item.path}
      accent={item.accent}
      size={size}
    />
  ) : (
    <FileIcon kind={fileKind} name={item.name} mime={item.mime} size={size} />
  );
  if (isFolder || !item.thumbnail || failed || !fileKind || !THUMB_KINDS.has(fileKind)) return icon;
  // The icon shows while the thumbnail loads, or if it fails (D-053).
  return (
    <span className={cn('hl-file-thumb', list && 'hl-file-sm')}>
      {loaded ? null : icon}
      <img
        src={item.thumbnail}
        alt=""
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        style={loaded ? undefined : { opacity: 0 }}
      />
    </span>
  );
}

/** A file or folder as a grid tile or list row. Click selects, double-click or Enter opens. */
export function FileItem(props: FileItemProps) {
  const t = useUiStrings();
  const list = props.view === 'list';
  const className = cn('hl-file', list ? 'hl-file-row' : 'hl-file-tile', props.selected && 'hl-file-selected');
  const content = (
    <>
      <Glyph item={props} list={list} />
      <span className="hl-file-name" title={props.name}>
        {props.name}
      </span>
      {props.meta ? <span className="hl-file-meta">{props.meta}</span> : null}
      {list && props.modified ? <span className="hl-file-meta hl-file-date">{props.modified}</span> : null}
      {props.shared ? (
        <span className="hl-file-shared" aria-label={t.shared} role="img">
          <Share2 size={14} strokeWidth={2} aria-hidden="true" />
        </span>
      ) : null}
    </>
  );
  const common = {
    className,
    role: props.role,
    'aria-selected': props.selected || undefined,
    onClick: props.onClick,
    onDoubleClick: props.onOpen,
    onContextMenu: props.onContextMenu,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && props.onOpen) {
        e.preventDefault();
        props.onOpen();
      }
    },
  };
  return props.href ? (
    <a href={props.href} {...common}>
      {content}
    </a>
  ) : (
    <button type="button" {...common}>
      {content}
    </button>
  );
}
