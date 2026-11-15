// FilePreview (US-FILE-06): a file over a dimmed window. Images fitted, videos in the browser's player, PDFs in its
// viewer, text files' first 1 MB in monospace; anything else its icon and Download. Previous and next move through the
// folder's files (Left and Right too); Escape closes and puts focus back on the file. Details on the right: size,
// dimensions, modified and where it is. Preview links last 5 minutes; an expired one is fetched again quietly.
import type { FileEntry } from '@hlabs/api';
import { ChevronLeft, ChevronRight, iconDefaults, X } from '@hlabs/icons';
import { formatBytes, isFeatureEnabled } from '@hlabs/shared';
import { Button, IconButton, ModalPanel } from '@hlabs/ui';
import { FileIcon } from '@hlabs/icons/files';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { filesCopy as copy } from '../copy/files';
import { useTRPC } from '../lib/trpc';
import { crumbName } from './places';

export type PreviewKind = 'image' | 'video' | 'pdf' | 'text' | 'none';

const IMAGES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']);
const VIDEOS = new Set(['video/mp4', 'video/webm', 'video/quicktime']);

/** The browser shows PDFs itself (phones usually don't, and would download it instead). */
const pdfViewer = () => typeof navigator === 'undefined' || navigator.pdfViewerEnabled !== false;

/** What the preview can show for a file (US-FILE-06). XLSX, ZIP, HEIC and the like: none. */
export function previewKind(mime: string | null, canShowPdf = pdfViewer()): PreviewKind {
  if (!mime) return 'none';
  if (IMAGES.has(mime)) return 'image';
  if (VIDEOS.has(mime)) return 'video';
  if (mime === 'application/pdf') return canShowPdf ? 'pdf' : 'none';
  if (mime.startsWith('text/') || mime === 'application/json' || mime === 'application/xml') return 'text';
  return 'none';
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "12 Sep 2026", in this browser's time. */
export const formatDay = (ms: number) => {
  const d = new Date(ms);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};

/** Where a file downloads from (US-FILE-05). */
export const downloadUrl = (path: string) => `/api/files/download?path=${encodeURIComponent(path)}`;

/** The signed link for a file; `renew` asks for a new one when it expired (410) or failed. */
function usePreviewUrl(path: string) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const options = trpc.files.preview.queryOptions({ path });
  const q = useQuery({ ...options, staleTime: 4 * 60_000, retry: false });
  const [renewed, setRenewed] = useState(0);
  const renew = useCallback(() => {
    // Once per file: a link that fails right after it was made isn't an expired link.
    setRenewed((n) => {
      if (n < 1) void queryClient.invalidateQueries({ queryKey: options.queryKey });
      return n + 1;
    });
  }, [queryClient, options.queryKey]);
  return { url: q.data?.url ?? null, failed: q.isError || renewed > 1, renew };
}

function TextPreview({ url, renew }: { url: string; renew: () => void }) {
  const [text, setText] = useState<{ body: string; truncated: boolean } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    void fetch(url, { credentials: 'same-origin' })
      .then(async (res) => {
        if (res.status === 410) return renew();
        if (!res.ok) throw new Error(String(res.status));
        const body = await res.text();
        if (live) setText({ body, truncated: res.headers.get('x-hlabs-truncated') === '1' });
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [url, renew]);
  if (failed) return <p className="m-0 text-body text-ink-muted">{copy.previewFailed}</p>;
  if (!text) return null;
  return (
    <div className="flex h-full w-full flex-col">
      <pre className="m-0 min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words p-5 font-mono text-mono text-ink">
        {text.body}
      </pre>
      {text.truncated ? <p className="m-0 px-5 pb-3 text-caption text-ink-muted">{copy.textTruncated}</p> : null}
    </div>
  );
}

function NoPreview({ entry }: { entry: FileEntry }) {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <FileIcon name={entry.name} mime={entry.mime} size={96} />
      <p className="m-0 text-headline">{copy.noPreview}</p>
      <Button variant="secondary" href={downloadUrl(entry.path)} download={entry.name}>
        {copy.download}
      </Button>
    </div>
  );
}

function Shown({ entry }: { entry: FileEntry }) {
  const kind = previewKind(entry.mime);
  const { url, failed, renew } = usePreviewUrl(entry.path);
  if (kind === 'none') return <NoPreview entry={entry} />;
  if (failed) return <p className="m-0 text-body text-ink-muted">{copy.previewFailed}</p>;
  if (!url) return null;
  if (kind === 'image') {
    return <img src={url} alt={entry.name} onError={renew} className="max-h-full max-w-full object-contain" />;
  }
  if (kind === 'video') {
    return (
      <video src={url} controls playsInline onError={renew} className="max-h-full max-w-full" aria-label={entry.name} />
    );
  }
  if (kind === 'pdf') {
    return <iframe src={url} title={entry.name} className="h-full w-full border-0 bg-white" />;
  }
  return <TextPreview url={url} renew={renew} />;
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 text-body-sm">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="m-0 text-right text-ink">{children}</dd>
    </div>
  );
}

export function FilePreview({
  entry,
  items,
  onNavigate,
  onClose,
  openWith,
}: {
  entry: FileEntry;
  /** The folder in its order: previous and next skip folders. */
  items: FileEntry[];
  onNavigate: (entry: FileEntry) => void;
  onClose: () => void;
  /** "Open with" (US-FILE-07), under the details. */
  openWith?: ReactNode;
}) {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const files = items.filter((e) => e.kind === 'file');
  const at = files.findIndex((e) => e.path === entry.path);
  const prev = at > 0 ? files[at - 1] : undefined;
  const next = at >= 0 && at < files.length - 1 ? files[at + 1] : undefined;
  const stat = useQuery({ ...trpc.files.stat.queryOptions({ path: entry.path }), retry: false }).data;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).closest('video, input, iframe')) return;
    if (e.key === 'ArrowLeft' && prev) {
      e.preventDefault();
      onNavigate(prev);
    } else if (e.key === 'ArrowRight' && next) {
      e.preventDefault();
      onNavigate(next);
    }
  };

  const location = stat?.parent ?? [];
  const goTo = location[location.length - 1]?.path;
  return (
    <ModalPanel
      label={copy.preview(entry.name)}
      onClose={onClose}
      scrim="strong"
      finalFocus={() => document.querySelector<HTMLElement>(`[data-path="${CSS.escape(entry.path)}"]`)}
    >
      <div
        onKeyDown={onKeyDown}
        className="m-auto grid h-full w-full max-w-[1280px] grid-rows-[auto_minmax(50dvh,1fr)_auto] gap-x-5 gap-y-3 p-4 md:max-h-[calc(100dvh-112px)] md:grid-cols-[1fr_300px] md:grid-rows-[auto_1fr] md:p-10"
      >
        <header className="flex min-w-0 items-center gap-3">
          <IconButton label={copy.closePreview} onClick={onClose} className="rounded-full">
            <X aria-hidden {...iconDefaults} />
          </IconButton>
          <h2 className="m-0 min-w-0 flex-1 truncate text-headline">{entry.name}</h2>
          {isFeatureEnabled('fileLinks') ? (
            <Button variant="secondary" size="sm">
              {copy.share}
            </Button>
          ) : null}
          <Button variant="secondary" size="sm" href={downloadUrl(entry.path)} download={entry.name}>
            {copy.download}
          </Button>
        </header>
        <section
          aria-label={copy.details}
          className="hl-glass hl-glass-2 order-last flex flex-col gap-4 overflow-y-auto rounded-xl p-5 md:order-none md:col-start-2 md:row-span-2 md:row-start-1"
        >
          <h3 className="m-0 text-headline">{copy.details}</h3>
          <dl className="m-0">
            <Detail label={copy.size}>{formatBytes(entry.size ?? 0)}</Detail>
            {stat?.dimensions ? (
              <Detail label={copy.dimensions}>
                {copy.dimensionsValue(stat.dimensions.width, stat.dimensions.height)}
              </Detail>
            ) : null}
            <Detail label={copy.modified}>{formatDay(entry.modifiedAt)}</Detail>
            {goTo ? (
              <Detail label={copy.location}>
                <button
                  type="button"
                  className="hl-focus cursor-pointer rounded-xs border-0 bg-transparent p-0 text-right font-sans text-body-sm text-ink underline-offset-2 hover:underline"
                  onClick={() => {
                    onClose();
                    void navigate({ to: '/files', search: { path: goTo } });
                  }}
                >
                  {location.map(crumbName).join(' › ')}
                </button>
              </Detail>
            ) : null}
          </dl>
          {openWith}
        </section>
        <div className="relative flex min-h-0 items-center justify-center overflow-hidden rounded-xl bg-surface-dialog">
          <Shown key={entry.path} entry={entry} />
          {prev ? (
            <IconButton
              label={copy.previous}
              onClick={() => onNavigate(prev)}
              className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full"
            >
              <ChevronLeft aria-hidden {...iconDefaults} />
            </IconButton>
          ) : null}
          {next ? (
            <IconButton
              label={copy.next}
              onClick={() => onNavigate(next)}
              className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full"
            >
              <ChevronRight aria-hidden {...iconDefaults} />
            </IconButton>
          ) : null}
        </div>
      </div>
    </ModalPanel>
  );
}
