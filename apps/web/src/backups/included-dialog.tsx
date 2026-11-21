// What's included (BackupIncluded, US-BKP-23): one tick per installed app (with what its manifest leaves out) and per
// Home folder and Shared, "Include new apps automatically", the system part that's always copied, and the size of a
// full copy as the ticks change. Save keeps it; Cancel forgets it.
import { formatBytes } from '@hlabs/shared';
import { Button, ModalDialog, Switch } from '@hlabs/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { backupsCopy as copy } from '../copy/backups';
import { showErrorToast } from '../lib/error-copy';
import { useTRPC, useTRPCClient } from '../lib/trpc';

type Include = { apps: string[]; folders: string[]; includeNewApps: boolean };

/** The include list, settled 300 ms after the last tick. */
function useSettled<T>(value: T, ms = 300): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

function Tick({
  label,
  size,
  note,
  checked,
  onChange,
}: {
  label: string;
  size: number | null;
  note?: string | null;
  checked: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 px-4 py-2 text-body text-ink">
      <input
        type="checkbox"
        className="hl-focus size-4.5 shrink-0 accent-[var(--color-accent)]"
        aria-label={label}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="shrink-0 text-body-sm text-ink-muted">
        {[size === null ? null : formatBytes(size), note].filter(Boolean).join(' · ')}
      </span>
    </label>
  );
}

export function IncludedDialog({ onClose }: { onClose: () => void }) {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();
  const plan = useQuery({ ...trpc.backups.plan.get.queryOptions(), retry: false });
  const [include, setInclude] = useState<Include | null>(null);
  const current = include ?? plan.data?.include ?? null;
  const settled = useSettled(current);
  const estimate = useQuery({
    ...trpc.backups.plan.estimate.queryOptions({ include: settled ?? undefined }),
    enabled: !!settled,
    placeholderData: (prev) => prev,
  });
  const save = useMutation({
    mutationFn: (next: Include) => client.backups.plan.update.mutate({ include: next }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: trpc.backups.overview.queryKey() }),
        queryClient.invalidateQueries({ queryKey: trpc.backups.plan.get.queryKey() }),
      ]);
      onClose();
    },
    onError: (err) => showErrorToast(err),
  });

  const toggle = (list: 'apps' | 'folders', id: string, on: boolean) => {
    if (!current) return;
    const next = on ? [...current[list], id] : current[list].filter((x) => x !== id);
    setInclude({ ...current, [list]: next });
  };

  return (
    <ModalDialog
      open
      onOpenChange={(open) => (open || save.isPending ? null : onClose())}
      sheetOnPhone
      width="min(760px, 100%)"
      title={copy.includedTitle}
      actions={
        <div className="flex w-full flex-col gap-3 md:flex-row md:items-center">
          <p className="m-0 flex flex-col text-body-sm md:mr-auto">
            <span className="font-semibold text-ink">
              {estimate.data ? copy.perCopy(formatBytes(estimate.data.fullCopyBytes)) : ' '}
            </span>
            <span className="text-ink-muted">{copy.laterCopies}</span>
          </p>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            {copy.cancel}
          </Button>
          <Button onClick={() => current && save.mutate(current)} busy={save.isPending} disabled={!current}>
            {copy.save}
          </Button>
        </div>
      }
    >
      {plan.data && current ? (
        <div className="flex flex-col gap-4 text-ink">
          <p className="m-0 text-body-sm text-ink-muted">{copy.includedBody}</p>
          <div className="grid gap-4 md:grid-cols-2">
            <section aria-labelledby="included-apps" className="flex flex-col gap-2">
              <h3 id="included-apps" className="m-0 text-label">
                {copy.appsColumn}
              </h3>
              <div className="max-h-80 overflow-y-auto rounded-lg bg-surface-input py-1">
                {plan.data.apps.length === 0 ? (
                  <p className="m-0 px-4 py-2 text-body-sm text-ink-muted">{copy.noApps}</p>
                ) : null}
                {plan.data.apps.map((a) => (
                  <Tick
                    key={a.id}
                    label={a.label}
                    size={a.sizeBytes}
                    note={a.excluded}
                    checked={current.apps.includes(a.id)}
                    onChange={(on) => toggle('apps', a.id, on)}
                  />
                ))}
              </div>
              <div className="flex items-center gap-3 rounded-lg bg-surface-input px-4 py-3">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-body">{copy.includeNew}</span>
                  <span className="text-body-sm text-ink-muted">{copy.includeNewNote}</span>
                </span>
                <Switch
                  aria-label={copy.includeNew}
                  checked={current.includeNewApps}
                  onChange={(on) => setInclude({ ...current, includeNewApps: on })}
                />
              </div>
            </section>
            <section aria-labelledby="included-files" className="flex flex-col gap-2">
              <h3 id="included-files" className="m-0 text-label">
                {copy.filesColumn}
              </h3>
              <div className="max-h-80 overflow-y-auto rounded-lg bg-surface-input py-1">
                {plan.data.folders.map((f) => (
                  <Tick
                    key={f.id}
                    label={f.label}
                    size={f.sizeBytes}
                    checked={current.folders.includes(f.id)}
                    onChange={(on) => toggle('folders', f.id, on)}
                  />
                ))}
              </div>
              <div className="hl-glass hl-glass-1 flex flex-col gap-1 rounded-lg px-4 py-3">
                <span className="text-label">{copy.alwaysIncluded}</span>
                <span className="text-body">{copy.alwaysWhat}</span>
                <span className="text-body-sm text-ink-muted">{copy.alwaysWhy}</span>
              </div>
            </section>
          </div>
        </div>
      ) : null}
    </ModalDialog>
  );
}
