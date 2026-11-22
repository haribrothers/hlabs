// "Add a widget" (US-HOME-19; WidgetPicker): hlabs's own widgets and those the person's apps offer, each with a live
// preview and Add (or Added); up to four fit on Home. Members get My files and Shared apps (and Live usage when allowed),
// and only widgets of apps shared with them that need no key (D-157).
import { iconDefaults, X } from '@hlabs/icons';
import { VISIBLE_PHASE } from '@hlabs/shared';
import { Button, DialogClose, ModalDialog } from '@hlabs/ui';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { editCopy as copy } from '../copy/home-edit';
import { useTRPC } from '../lib/trpc';
import { MAX_WIDGETS, renderWidget } from './widgets';

function Choice({
  name,
  preview,
  added,
  full,
  onAdd,
}: {
  name: string;
  preview: ReactNode;
  added: boolean;
  full: boolean;
  onAdd: () => void;
}) {
  return (
    <li className="flex list-none flex-col gap-3 rounded-lg bg-surface-row p-3">
      {/* A live preview: the widget itself, which can't be used from here. */}
      <div inert className="pointer-events-none [&_.hl-card]:min-h-28">
        {preview}
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-body font-semibold">{name}</span>
        {added ? (
          <Button variant="secondary" size="sm" disabled>
            {copy.added}
          </Button>
        ) : (
          <Button size="sm" disabled={full} onClick={onAdd} aria-label={copy.addNamed(name)}>
            {copy.add}
          </Button>
        )}
      </div>
    </li>
  );
}

export function WidgetPicker({
  open,
  onOpenChange,
  added,
  onAdd,
  shippedPhase = VISIBLE_PHASE,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  added: readonly string[];
  onAdd: (id: string) => void;
  shippedPhase?: number;
}) {
  const trpc = useTRPC();
  const catalog = useQuery({ ...trpc.home.listWidgets.queryOptions(), enabled: open, retry: false });
  const full = added.length >= MAX_WIDGETS;
  // Only widgets that can be drawn now (D-036).
  const system = (catalog.data?.system ?? []).filter((w) => renderWidget(w.id, shippedPhase) !== null);
  const apps = catalog.data?.apps ?? [];
  const grid = 'm-0 grid grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3';
  return (
    <ModalDialog open={open} onOpenChange={onOpenChange} title={copy.pickerTitle} width={1000} sheetOnPhone>
      <DialogClose asChild>
        <button
          type="button"
          aria-label={copy.close}
          className="hl-focus absolute right-6 top-6 grid size-9 place-items-center rounded-pill border-0 bg-surface-control text-ink"
        >
          <X aria-hidden {...iconDefaults} className="size-4" />
        </button>
      </DialogClose>
      <div className="flex flex-col gap-4">
        {full ? <p className="m-0 text-body-sm text-warning">{copy.full}</p> : null}
        <section aria-labelledby="picker-system" className="flex flex-col gap-2">
          <h3 id="picker-system" className="m-0 text-body-sm font-semibold text-ink-muted">
            {copy.system}
          </h3>
          <ul className={grid}>
            {system.map((w) => (
              <Choice
                key={w.id}
                name={copy.widgetNames[w.id as keyof typeof copy.widgetNames] ?? w.name}
                preview={renderWidget(w.id, shippedPhase)}
                added={added.includes(w.id)}
                full={full}
                onAdd={() => onAdd(w.id)}
              />
            ))}
          </ul>
        </section>
        {apps.length ? (
          <section aria-labelledby="picker-apps" className="flex flex-col gap-2">
            <h3 id="picker-apps" className="m-0 text-body-sm font-semibold text-ink-muted">
              {copy.fromApps}
            </h3>
            <ul className={grid}>
              {apps.map((w) => (
                <Choice
                  key={w.id}
                  name={w.name}
                  preview={renderWidget(w.id, shippedPhase)}
                  added={added.includes(w.id)}
                  full={full}
                  onAdd={() => onAdd(w.id)}
                />
              ))}
            </ul>
          </section>
        ) : null}
        <p className="m-0 text-caption text-ink-muted">{copy.footer}</p>
      </div>
    </ModalDialog>
  );
}
