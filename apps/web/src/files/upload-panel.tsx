// The Uploads panel (FilesUpload, US-FILE-08, US-FILE-09): "Uploading 3 files", the time left, one row per file with
// Done, "62% · 1.1 of 1.8 GB" and a bar, or Waiting; Pause/Resume and Cancel all.
import { Button, Progress } from '@hlabs/ui';
import { filesCopy as copy } from '../copy/files';
import { isFinished, type UploadRow, type UploadSnapshot } from './upload-manager';

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

/** "62% · 1.1 of 1.8 GB": both amounts in the total's unit. */
export function rowProgress(sent: number, total: number): string {
  const pct = total ? Math.floor((sent / total) * 100) : 100;
  let unit = 0;
  while (total >= 1000 ** (unit + 1) && unit < UNITS.length - 1) unit++;
  const show = (n: number) => {
    const v = n / 1000 ** unit;
    return String(unit === 0 ? Math.round(v) : v < 10 ? Math.round(v * 10) / 10 : Math.round(v));
  };
  return copy.rowProgress(pct, show(sent), `${show(total)} ${UNITS[unit]}`);
}

function Row({ row }: { row: UploadRow }) {
  const uploading = row.status === 'uploading';
  const done = row.status === 'done';
  const status = uploading ? rowProgress(row.sent, row.size) : (copy.rowStatus[row.status] ?? '');
  const tone = done
    ? 'text-success'
    : ['noSpace', 'readOnly', 'failed', 'elsewhere'].includes(row.status)
      ? 'text-danger'
      : 'text-ink-muted';
  const value = done ? 100 : row.size ? (row.sent / row.size) * 100 : 0;
  return (
    <li className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3 text-body-sm">
        <span className="min-w-0 truncate text-ink">{row.savedAs ?? row.name}</span>
        <span className={`shrink-0 ${tone}`}>{status}</span>
      </div>
      <Progress
        value={value}
        tone={done ? 'success' : 'accent'}
        aria-label={`${row.name}: ${status}`}
        className="min-w-0"
      />
    </li>
  );
}

export function UploadPanel({
  snapshot,
  onPause,
  onResume,
  onCancelAll,
}: {
  snapshot: UploadSnapshot;
  onPause: () => void;
  onResume: () => void;
  onCancelAll: () => void;
}) {
  const { rows, paused, secondsLeft } = snapshot;
  if (!rows.length) return null;
  const finished = rows.every(isFinished);
  const uploaded = rows.filter((r) => r.status === 'done').length;
  return (
    <section
      aria-label={copy.uploads}
      className="hl-card hl-glass hl-glass-3 absolute right-6 bottom-6 z-10 flex w-[380px] max-w-[calc(100%-2rem)] flex-col gap-3 p-4 max-md:fixed max-md:right-4 max-md:bottom-28"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="m-0 text-headline">{finished ? copy.uploadedTitle(uploaded) : copy.uploading(rows.length)}</h2>
        {!finished && !paused && secondsLeft !== null ? (
          <span className="text-caption text-ink-muted">{copy.eta(secondsLeft)}</span>
        ) : null}
      </div>
      <ul className="m-0 flex max-h-64 list-none flex-col gap-3 overflow-y-auto p-0" aria-live="polite">
        {rows.map((r) => (
          <Row key={r.key} row={r} />
        ))}
      </ul>
      {finished ? null : (
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={paused ? onResume : onPause}>
            {paused ? copy.resume : copy.pause}
          </Button>
          <Button variant="secondary" size="sm" onClick={onCancelAll}>
            {copy.cancelAll}
          </Button>
        </div>
      )}
    </section>
  );
}
