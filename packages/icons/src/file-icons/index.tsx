import type { CSSProperties } from 'react';
import { FILE_ICON_SVGS } from './data';

/**
 * File and folder icons for the Files app, from the Papirus icon theme (GPL-3.0).
 * Import from '@hlabs/icons/files' so the ~40 KB (gzip) of icon data only loads with Files.
 */

export type Accent = 'violet' | 'mint' | 'amber' | 'rose';

export type FolderKind =
  | 'plain'
  | 'documents'
  | 'pictures'
  | 'music'
  | 'videos'
  | 'downloads'
  | 'shared'
  | 'apps'
  | 'backup'
  | 'network'
  | 'private';

export type FileKind =
  | 'image'
  | 'design'
  | 'vector'
  | 'video'
  | 'audio'
  | 'pdf'
  | 'document'
  | 'spreadsheet'
  | 'presentation'
  | 'archive'
  | 'disk-image'
  | 'mac-installer'
  | 'linux-package'
  | 'android-package'
  | 'executable'
  | 'windows-program'
  | 'code'
  | 'javascript'
  | 'python'
  | 'html'
  | 'json'
  | 'markdown'
  | 'text'
  | 'log'
  | 'csv'
  | 'calendar'
  | 'contact'
  | 'ebook'
  | 'font'
  | 'database'
  | 'sql'
  | 'key'
  | 'torrent'
  | 'unknown';

/** Folder colour follows the accent (D-053): Violet → violet, Mint → teal, Amber → yellow, Rose → magenta. */
export const FOLDER_COLOUR: Record<Accent, 'violet' | 'teal' | 'yellow' | 'magenta'> = {
  violet: 'violet',
  mint: 'teal',
  amber: 'yellow',
  rose: 'magenta',
};

const EXT: Record<string, FileKind> = {};
function map(kind: FileKind, exts: string) {
  for (const e of exts.split(' ')) EXT[e] = kind;
}
map('image', 'jpg jpeg png gif webp heic heif avif bmp tif tiff raw cr2 cr3 nef arw dng orf rw2');
map('design', 'psd psb ai sketch fig xd afdesign afphoto');
map('vector', 'svg eps');
map('video', 'mp4 m4v mov mkv avi webm wmv flv mpg mpeg 3gp ts m2ts');
map('audio', 'mp3 m4a aac flac wav aiff aif ogg opus wma alac');
map('pdf', 'pdf');
map('document', 'doc docx odt rtf pages');
map('spreadsheet', 'xls xlsx ods numbers');
map('presentation', 'ppt pptx odp key');
map('archive', 'zip rar 7z tar gz tgz bz2 xz zst');
map('disk-image', 'iso img');
map('mac-installer', 'dmg pkg');
map('linux-package', 'deb rpm appimage flatpak snap');
map('android-package', 'apk aab');
map('executable', 'bin run sh command');
map('windows-program', 'exe msi bat cmd');
map(
  'code',
  'c h cpp hpp cs go rs java kt swift rb php lua pl r scala dart vue svelte css scss less toml ini conf cfg yml yaml xml',
);
map('javascript', 'js mjs cjs jsx ts tsx');
map('python', 'py ipynb');
map('html', 'html htm');
map('json', 'json jsonc');
map('markdown', 'md markdown mdx');
map('text', 'txt');
map('log', 'log');
map('csv', 'csv tsv');
map('calendar', 'ics ical');
map('contact', 'vcf vcard');
map('ebook', 'epub mobi azw3 cbz cbr');
map('font', 'ttf otf woff woff2');
map('database', 'db sqlite sqlite3');
map('sql', 'sql');
map('key', 'pem key crt cer asc gpg pgp kdbx');
map('torrent', 'torrent');

const MIME_PREFIX: Array<[string, FileKind]> = [
  ['image/', 'image'],
  ['video/', 'video'],
  ['audio/', 'audio'],
  ['text/', 'text'],
  ['font/', 'font'],
];

/** Picks the icon kind for a file from its name (extension), falling back to its MIME type. */
export function fileKindOf(name: string, mime?: string | null): FileKind {
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
  if (ext && EXT[ext]) return EXT[ext];
  if (mime) {
    if (mime === 'application/pdf') return 'pdf';
    for (const [prefix, kind] of MIME_PREFIX) if (mime.startsWith(prefix)) return kind;
  }
  return 'unknown';
}

const SPECIAL: Record<string, FolderKind> = {
  documents: 'documents',
  photos: 'pictures',
  pictures: 'pictures',
  music: 'music',
  videos: 'videos',
  movies: 'videos',
  downloads: 'downloads',
  backups: 'backup',
  restored: 'backup',
};

/**
 * Picks the folder icon from its virtual path (see 05-api: /home, /shared, /users/<u>, /appdata/<id>, /drives/<id>).
 * Only well-known folders at the top of a Home folder get a special icon; everything else is plain.
 */
export function folderKindOf(path: string): FolderKind {
  const parts = path.split('/').filter(Boolean);
  if (parts[0] === 'shared' && parts.length === 1) return 'shared';
  if (parts[0] === 'appdata' && parts.length === 2) return 'apps';
  if (parts[0] === 'drives' && parts.length === 2) return 'network';
  const inHomeRoot = (parts[0] === 'home' && parts.length === 2) || (parts[0] === 'users' && parts.length === 3);
  if (inHomeRoot) return SPECIAL[parts.at(-1)!.toLowerCase()] ?? 'plain';
  return 'plain';
}

function svgFor(key: string): string {
  return FILE_ICON_SVGS[key] ?? FILE_ICON_SVGS[key.replace(/^\d+/, '64')] ?? FILE_ICON_SVGS['64/file-unknown']!;
}

/** A data: URL for an icon, e.g. for CSS backgrounds or <img>. 24px art is used at 32px and below. */
export function fileIconUrl(opts: { kind: FileKind } | { folder: FolderKind; accent?: Accent }, size = 64): string {
  const art = size <= 32 ? '24' : '64';
  const key =
    'folder' in opts
      ? `${art}/folder-${FOLDER_COLOUR[opts.accent ?? 'violet']}-${opts.folder}`
      : `${art}/file-${opts.kind}`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svgFor(key))}`;
}

export interface FileIconProps {
  /** File name; its extension picks the icon. Ignored when `folder` is set. */
  name?: string;
  mime?: string | null;
  /** Set for folders: a kind, or `true` to work it out from `path`. */
  folder?: FolderKind | true;
  path?: string;
  /** Override the kind worked out from the name. */
  kind?: FileKind;
  /** Current accent; folders follow it. Default violet. */
  accent?: Accent;
  /** Pixel size. 64 in the grid, 24 in lists. Default 64. */
  size?: number;
  className?: string;
  style?: CSSProperties;
}

/** Decorative icon for a file or folder (the visible file name is the accessible label). */
export function FileIcon({
  name = '',
  mime,
  folder,
  path = '',
  kind,
  accent = 'violet',
  size = 64,
  className,
  style,
}: FileIconProps) {
  const src = folder
    ? fileIconUrl({ folder: folder === true ? folderKindOf(path) : folder, accent }, size)
    : fileIconUrl({ kind: kind ?? fileKindOf(name, mime) }, size);
  return (
    <img
      src={src}
      alt=""
      aria-hidden
      width={size}
      height={size}
      draggable={false}
      className={className}
      style={{ display: 'block', flexShrink: 0, ...style }}
    />
  );
}
