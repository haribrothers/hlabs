// hlabs design system — component props (documentation; not type-checked).
// Global: window.Hlabs. Needs React 18 + ReactDOM 18, tokens.css and bundle.css.
import type { ReactNode, ReactElement } from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** 'primary' = white pill, one per view. Default 'primary'. */
  variant?: 'primary' | 'secondary' | 'destructive' | 'link';
  /** Height 34 / 42 / 48px. Ignored for 'link'. Default 'md'. */
  size?: 'sm' | 'md' | 'lg';
  /** Renders an <a> instead of a <button>. */
  href?: string;
  children: ReactNode;
}
export function Button(props: ButtonProps): ReactElement;

export interface SwitchProps {
  checked?: boolean;          // controlled
  defaultChecked?: boolean;   // uncontrolled
  onChange?: (next: boolean) => void;
  /** Visible label; without it pass aria-label. */
  label?: ReactNode;
  'aria-label'?: string;
}
export function Switch(props: SwitchProps): ReactElement;

export interface TextFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: ReactNode;
  hint?: ReactNode;
  /** Replaces the hint and turns the outline danger. */
  error?: ReactNode;
}
export function TextField(props: TextFieldProps): ReactElement;

export interface SegmentedProps {
  options: { value: string; label: ReactNode }[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  'aria-label'?: string;
}
export function Segmented(props: SegmentedProps): ReactElement;

export interface BadgeProps { tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'accent'; children: ReactNode; }
export function Badge(props: BadgeProps): ReactElement;

export interface StatusDotProps { status?: 'running' | 'working' | 'failed' | 'stopped'; children?: ReactNode; }
export function StatusDot(props: StatusDotProps): ReactElement;

export interface ProgressProps {
  /** 0–100 */
  value: number;
  label?: ReactNode;
  /** Right-hand text; defaults to "<value>%". */
  detail?: ReactNode;
}
export function Progress(props: ProgressProps): ReactElement;

export interface GlassCardProps {
  /** 1 = widget on wallpaper, 2 = window, 3 = dialog/menu. Default 1. */
  level?: 1 | 2 | 3;
  title?: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  children?: ReactNode;
}
export function GlassCard(props: GlassCardProps): ReactElement;

export interface ListProps { label?: ReactNode; children: ReactNode; }
export function List(props: ListProps): ReactElement;

export interface ListRowProps {
  title: ReactNode;
  subtitle?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  /** Makes the whole row a link with a hover state. */
  href?: string;
}
export function ListRow(props: ListRowProps): ReactElement;

export interface AppIconProps {
  name: string;
  /** The app's own logo from its manifest (square PNG/SVG, ≥256px). Fills the tile; the gradient shows while it loads or if it's missing. */
  src?: string;
  /** Two stops of the fallback tile gradient, top-left → bottom-right. */
  colors?: [string, string];
  /** A white 1.8–2px stroke icon, ~34px. */
  icon?: ReactNode;
  state?: 'running' | 'installing' | 'stopped' | 'update' | 'error';
  /** 0–100, shown as a ring while installing. */
  progress?: number;
  href?: string;
}
export function AppIcon(props: AppIconProps): ReactElement;

export interface TabItem {
  id: string;
  label: string;
  /** Key of Hlabs.glyphs; defaults to id. */
  icon?: 'home' | 'store' | 'files' | 'usage' | 'backups' | 'settings' | string;
  /** Red count badge. */
  badge?: number;
}
export interface TabBarProps {
  /** Defaults to Home, App Store (2), Files, Usage, Backups, Settings. */
  items?: TabItem[];
  active?: string;
  defaultActive?: string;
  onSelect?: (id: string) => void;
  /** Separate search circle. Pass false on phone. Default shown. */
  search?: boolean;
  onSearch?: () => void;
}
export function TabBar(props: TabBarProps): ReactElement;

export interface DockApp {
  id: string;
  name: string;
  /** App logo URL (manifest). Falls back to a gradient tile. */
  logo?: string;
  colors?: [string, string];
  /** White icon shown on the gradient fallback. */
  icon?: ReactNode;
  /** Has an open window: shows the dot. */
  open?: boolean;
  badge?: number;
}
/** Desktop and web navigation (≥ 768px wide), in the spirit of the macOS Dock (D-054). Phones keep TabBar. */
export interface DockProps {
  /** Defaults to Home, App Store, Files, Usage, Backups, Settings. Family members: Home, Files, Settings. */
  areas?: TabItem[];
  active?: string;
  onSelect?: (id: string) => void;
  /** Counts by area id, e.g. { store: 2 }. */
  badges?: Record<string, number>;
  /** The person's pinned apps, in order (up to 8). */
  apps?: DockApp[];
  onOpenApp?: (id: string) => void;
  /** Right-click or long-press on a pinned app: open the Menu (Open, Open in a new tab, App settings, Remove from Dock). */
  onAppMenu?: (id: string, e: React.MouseEvent) => void;
  /** Shows the dashed + tile. */
  onAdd?: () => void;
  onSearch?: () => void;
  /** Default true. Pass false to show Search elsewhere. */
  search?: boolean;
  /** Hover magnification. Default true; always off with Reduce motion. */
  magnify?: boolean;
}
export function Dock(props: DockProps): ReactElement;

export interface DialogProps {
  title: ReactNode;
  children?: ReactNode;
  /** Buttons, right-aligned; primary last. */
  actions?: ReactNode;
  /** 'alertdialog' for destructive confirmations. */
  role?: 'dialog' | 'alertdialog';
  width?: number | string;
}
export function Dialog(props: DialogProps): ReactElement;

export interface ToastProps {
  tone?: 'success' | 'warning' | 'danger';
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}
export function Toast(props: ToastProps): ReactElement;

export interface LogoProps {
  /** 'mark' (default) or 'lockup' (mark + "hlabs" wordmark). */
  variant?: 'mark' | 'lockup';
  /** 'color' on dark/glass (default), 'on-light' on white, or single-colour 'white' | 'ink' | 'current'. */
  tone?: 'color' | 'on-light' | 'white' | 'ink' | 'current';
  /** Height in px; width follows the aspect ratio. Default 24 (mark) / 32 (lockup). */
  size?: number;
  /** Accessible name, default "hlabs"; pass "" when a visible label sits next to it. */
  title?: string;
  /** Drop the dots and thicken the stroke; default true at 20px and below. */
  simplified?: boolean;
}
/** The hlabs logo. In app code use LogoMark / LogoLockup from @hlabs/icons. */
export function Logo(props: LogoProps): ReactElement;

/* ---------- Charts: series colours come from chart-1…chart-6 in order ---------- */
export interface LineChartProps {
  /** One to six series; a single series gets an area wash and no legend. */
  series: { name: string; values: number[] }[];
  /** X labels, one per value (times or dates). */
  labels: string[];
  title?: string;
  /** Appended to values: '%', ' GB', ' MB/s'. */
  unit?: string;
  /** Fixed y max (e.g. 100 for percentages); otherwise a clean number above the data. */
  max?: number;
  area?: boolean;
  width?: number;
  height?: number;
  formatValue?: (v: number) => string;
}
/** CPU, memory, network over time. Crosshair + tooltip on hover, arrow keys to step, hidden data table. */
export function LineChart(props: LineChartProps): ReactElement;

export interface BarChartProps {
  data: { label: string; value: number; status?: 'failed' | 'warning'; statusText?: string }[];
  title?: string;
  unit?: string;
  valueLabel?: string;
  max?: number;
  width?: number;
  height?: number;
  formatValue?: (v: number) => string;
}
/** Columns over time, e.g. backup size per day; failed runs turn danger and get an × mark. */
export function BarChart(props: BarChartProps): ReactElement;

export interface StackedBarProps {
  /** Used parts, in chart order; the rest of total shows as Free. */
  segments: { label: string; value: number }[];
  total?: number;
  title?: string;
  unit?: string;
  formatValue?: (v: number) => string;
}
/** Storage breakdown: one bar, 2px gaps, legend with values. */
export function StackedBar(props: StackedBarProps): ReactElement;

export interface SparklineProps { values: number[]; width?: number; height?: number; label?: string; }
/** Tiny trend for widgets and stat tiles; latest point in accent. */
export function Sparkline(props: SparklineProps): ReactElement;

/* ---------- Menus ---------- */
export interface MenuItem {
  label?: ReactNode;
  icon?: ReactNode;
  shortcut?: string;
  detail?: string;
  href?: string;
  onSelect?: () => void;
  checked?: boolean;
  disabled?: boolean;
  danger?: boolean;
  submenu?: boolean;
  separator?: boolean;
}
export interface MenuProps { label: string; items: MenuItem[]; width?: number; header?: ReactNode; }
/** Dropdown and context menus. The consumer positions it and handles focus and Escape. */
export function Menu(props: MenuProps): ReactElement;

export interface TrayMenuProps {
  status?: 'running' | 'working' | 'failed' | 'stopped';
  statusText?: string;
  stats?: { label: string; value: string }[];
  items: MenuItem[];
  width?: number;
}
/** The Mac menu-bar dropdown (the Tauri tray window). Linux uses the desktop's native menu instead. */
export function TrayMenu(props: TrayMenuProps): ReactElement;

/* ---------- Files ---------- */
export type FileAccent = 'violet' | 'mint' | 'amber' | 'rose';
export type FolderKind = 'plain' | 'documents' | 'pictures' | 'music' | 'videos' | 'downloads' | 'shared' | 'apps' | 'backup' | 'network' | 'private';
export type FileKind =
  | 'image' | 'design' | 'vector' | 'video' | 'audio' | 'pdf' | 'document' | 'spreadsheet' | 'presentation'
  | 'archive' | 'disk-image' | 'mac-installer' | 'linux-package' | 'android-package' | 'executable' | 'windows-program'
  | 'code' | 'javascript' | 'python' | 'html' | 'json' | 'markdown' | 'text' | 'log' | 'csv' | 'calendar' | 'contact'
  | 'ebook' | 'font' | 'database' | 'sql' | 'key' | 'torrent' | 'unknown';

/** Papirus colour icon for a file or folder (Files app only, D-053). Decorative. */
export interface FileIconProps {
  /** File name; its extension picks the icon. */
  name?: string;
  mime?: string | null;
  /** Folder kind, or `true` to work it out from `path`. */
  folder?: FolderKind | true;
  /** Virtual path, e.g. /home/Photos, /shared, /appdata/jellyfin, /drives/nas. */
  path?: string;
  kind?: FileKind;
  /** Folders follow the accent. Default: the page's data-accent, else violet. */
  accent?: FileAccent;
  /** 72 grid, 56 phone, 24 lists, 16/20 menus. Default 64. */
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}
export function FileIcon(props: FileIconProps): ReactElement;
export function fileKindOf(name: string, mime?: string | null): FileKind;
export function folderKindOf(path: string): FolderKind;
export function fileIconUrl(opts: { kind: FileKind } | { folder: FolderKind; accent?: FileAccent }, size?: number): string;

export interface FileItemProps {
  name: string;
  /** 'folder' for folders. For files, leave it out to pick the kind from `name`/`mime`. Legacy 'doc' | 'sheet' | 'other' still work. */
  kind?: 'folder' | FileKind | 'doc' | 'sheet' | 'other';
  mime?: string | null;
  /** Folder's virtual path; picks special folder icons (Documents, Photos …). */
  path?: string;
  /** Override the folder icon. */
  folderKind?: FolderKind;
  accent?: FileAccent;
  /** "24 items" for folders, size for files. */
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
  onClick?: (e: React.MouseEvent) => void;
  onOpen?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}
export function FileItem(props: FileItemProps): ReactElement;

/* ---------- Onboarding ---------- */
export interface StepperProps { steps: string[]; /** zero-based */ current: number; label?: string; }
export function Stepper(props: StepperProps): ReactElement;

/** Motion values for Framer Motion: durations in ms, cubic-bezier arrays and spring configs. */
export const motion: {
  fast: 120; base: 200; slow: 320;
  ease: [number, number, number, number];
  easeIn: [number, number, number, number];
  spring: { type: 'spring'; stiffness: number; damping: number; mass: number };
  springSoft: { type: 'spring'; stiffness: number; damping: number };
};

/** Filled 24px glyph paths used by the tab bar. */
export const glyphs: Record<'home' | 'store' | 'files' | 'usage' | 'backups' | 'settings' | 'search', string[]>;
