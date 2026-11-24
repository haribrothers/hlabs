// Home's edit mode (US-HOME-16, 17, 18; HomeEdit): drag widgets within their row and apps within the grid (mouse, touch
// with a long press, or Space and the arrow keys, each step announced), take things off Home with "–", add widgets, and
// "Done" to save. "Add app" brings back apps taken off Home. Nothing in edit mode opens; "Install app" is hidden while
// editing.
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { appTileLook, iconDefaults, Minus, Plus } from '@hlabs/icons';
import { isFeatureEnabled, VISIBLE_PHASE } from '@hlabs/shared';
import { AppIcon, Button, useReduceMotion } from '@hlabs/ui';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { editCopy as copy } from '../copy/home-edit';
import { useTRPC } from '../lib/trpc';
import type { HomeApp } from './home-app';
import { AppPicker } from './app-picker';
import { WidgetPicker } from './widget-picker';
import { isAppWidget, LG_COLUMNS, MAX_WIDGETS, renderWidget } from './widgets';

/** Home as it's being edited: the widgets row, the grid's order, and the apps taken off Home. */
export interface Draft {
  widgets: string[];
  apps: string[];
  hidden: string[];
}

/** How long a finger rests before a drag starts on touch (the same as a long press, US-HOME-17). */
const TOUCH_DELAY_MS = 250;
/** Tiles make room in at most 200 ms; never with Reduce motion. */
const SHIFT_MS = 200;

/** A widget's name, for the remove button and what a screen reader hears while it moves. */
export function useWidgetName() {
  const trpc = useTRPC();
  const catalog = useQuery({ ...trpc.home.listWidgets.queryOptions(), retry: false });
  return (id: string) => {
    if (isAppWidget(id)) {
      const w = catalog.data?.apps.find((a) => a.id === id);
      return w ? `${w.appName} · ${w.name}` : id;
    }
    return copy.widgetNames[id as keyof typeof copy.widgetNames] ?? id;
  };
}

function Sortable({
  id,
  label,
  onRemove,
  removeLabel,
  className,
  fill = false,
  children,
}: {
  id: string;
  label: string;
  onRemove: () => void;
  removeLabel: string;
  className?: string;
  /** Fills its cell (a widget); otherwise as big as what it shows (an app tile). */
  fill?: boolean;
  children: ReactNode;
}) {
  const reduce = useReduceMotion();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    transition: reduce ? null : { duration: SHIFT_MS, easing: 'cubic-bezier(0.25, 1, 0.5, 1)' },
  });
  return (
    <li
      ref={setNodeRef}
      className={`list-none ${className ?? ''} ${isDragging ? 'z-10 opacity-80' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition: reduce ? undefined : transition }}
    >
      {/* The "–" sits on the item's own corner (HomeEdit), not the grid cell's. */}
      <div className={`relative ${fill ? 'h-full' : 'inline-flex'}`}>
        <div
          {...attributes}
          {...listeners}
          aria-label={label}
          className="hl-focus h-full cursor-grab touch-none rounded-lg outline-offset-4 active:cursor-grabbing"
        >
          {/* What it shows, without opening anything while editing. */}
          <div inert className="pointer-events-none h-full select-none">
            {children}
          </div>
        </div>
        <button
          type="button"
          aria-label={removeLabel}
          onClick={onRemove}
          className="hl-focus hl-edit-remove absolute -left-2 -top-2 z-10 grid size-7 place-items-center rounded-pill border-0 bg-fill-primary text-ink-on-light shadow-menu"
        >
          <Minus aria-hidden {...iconDefaults} className="size-4" />
        </button>
      </div>
    </li>
  );
}

function announcements(name: (id: string) => string, ids: readonly string[]): Announcements {
  const at = (id: string | number) => copy.position(name(String(id)), ids.indexOf(String(id)) + 1, ids.length);
  return {
    onDragStart: ({ active }) => copy.pickedUp(at(active.id)),
    onDragOver: ({ active, over }) =>
      over ? copy.position(name(String(active.id)), ids.indexOf(String(over.id)) + 1, ids.length) : undefined,
    onDragEnd: ({ active, over }) =>
      copy.dropped(
        over ? copy.position(name(String(active.id)), ids.indexOf(String(over.id)) + 1, ids.length) : at(active.id),
      ),
    onDragCancel: ({ active }) => copy.cancelled(name(String(active.id))),
  };
}

export function EditHome({
  draft,
  onChange,
  apps,
  onDone,
  onCancel,
  saving,
  shippedPhase = VISIBLE_PHASE,
}: {
  draft: Draft;
  onChange: (d: Draft) => void;
  apps: ReadonlyMap<string, HomeApp>;
  onDone: () => void;
  onCancel: () => void;
  saving: boolean;
  shippedPhase?: number;
}) {
  const navigate = useNavigate();
  const widgetName = useWidgetName();
  const [picking, setPicking] = useState(false);
  const [pickingApp, setPickingApp] = useState(false);
  /** A drag is under way: Escape then cancels the drag, not edit mode. */
  const dragging = useRef(false);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: TOUCH_DELAY_MS, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  // The widgets drawn now (their phase has shipped); the others keep their place in the saved list.
  const shownWidgets = draft.widgets.filter((id) => renderWidget(id, shippedPhase) !== null);
  const appIds = draft.apps.filter((id) => apps.has(id));
  const appName = (id: string) => apps.get(id)?.name ?? id;

  // Escape outside a drag or the picker throws away every change since edit mode started (US-HOME-16).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || dragging.current || picking || pickingApp || e.defaultPrevented) return;
      onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel, picking, pickingApp]);

  const start = () => (dragging.current = true);
  // The key that ended the drag is still being handled: let it finish before Escape means "leave".
  const stop = () => setTimeout(() => (dragging.current = false), 0);
  const moved = (ids: string[], e: DragEndEvent) =>
    e.over && e.active.id !== e.over.id
      ? arrayMove(ids, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id)))
      : null;
  function onWidgetsDropped(e: DragEndEvent) {
    stop();
    const next = moved(shownWidgets, e);
    if (next) onChange({ ...draft, widgets: [...next, ...draft.widgets.filter((id) => !shownWidgets.includes(id))] });
  }
  function onAppsDropped(e: DragEndEvent) {
    stop();
    const next = moved(appIds, e);
    if (next) onChange({ ...draft, apps: next });
  }

  return (
    <>
      {shownWidgets.length ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={start}
          onDragCancel={stop}
          onDragEnd={onWidgetsDropped}
          accessibility={{
            announcements: announcements(widgetName, shownWidgets),
            screenReaderInstructions: { draggable: copy.instructions },
          }}
        >
          <SortableContext items={shownWidgets} strategy={rectSortingStrategy}>
            <ul
              aria-label={copy.widgets}
              className={`m-0 grid w-full grid-cols-2 gap-2.5 p-0 md:gap-4 ${LG_COLUMNS[shownWidgets.length] ?? 'lg:grid-cols-4'}`}
            >
              {shownWidgets.map((id) => (
                <Sortable
                  key={id}
                  id={id}
                  label={widgetName(id)}
                  removeLabel={copy.removeWidget}
                  onRemove={() => onChange({ ...draft, widgets: draft.widgets.filter((w) => w !== id) })}
                  className="rounded-xl outline-2 outline-offset-4 outline-dashed outline-border-glass"
                  fill
                >
                  {renderWidget(id, shippedPhase)}
                </Sortable>
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      ) : null}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={start}
        onDragCancel={stop}
        onDragEnd={onAppsDropped}
        accessibility={{
          announcements: announcements(appName, appIds),
          screenReaderInstructions: { draggable: copy.instructions },
        }}
      >
        <SortableContext items={appIds} strategy={rectSortingStrategy}>
          <ul
            aria-label={copy.apps}
            className="hl-home-grid m-0 grid w-full list-none grid-cols-4 gap-x-4 gap-y-6 p-0 lg:grid-cols-5 xl:grid-cols-6"
          >
            {appIds.map((id) => {
              const app = apps.get(id)!;
              const look = appTileLook(app.name, app.icon);
              return (
                <Sortable
                  key={id}
                  id={id}
                  label={app.name}
                  removeLabel={copy.removeApp(app.name)}
                  onRemove={() =>
                    onChange({ ...draft, apps: draft.apps.filter((a) => a !== id), hidden: [...draft.hidden, id] })
                  }
                  className="flex justify-center"
                >
                  <AppIcon name={app.name} src={app.icon.logoUrl} colors={look.colors} icon={look.fallbackIcon} />
                </Sortable>
              );
            })}
          </ul>
        </SortableContext>
      </DndContext>

      <div
        role="toolbar"
        aria-label={copy.editing}
        className="hl-glass hl-glass-2 fixed bottom-32 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-pill py-2 pl-5 pr-2 shadow-menu md:bottom-30"
      >
        <span className="pr-2 text-body font-semibold">{copy.editing}</span>
        <Button variant="secondary" size="sm" onClick={() => setPicking(true)}>
          <Plus aria-hidden {...iconDefaults} className="size-4" />
          {copy.addWidget}
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setPickingApp(true)}>
          <Plus aria-hidden {...iconDefaults} className="size-4" />
          {copy.addApp}
        </Button>
        {/* Everyone can change their own wallpaper (D-010); the page arrives with Appearance. */}
        {isFeatureEnabled('appearance', shippedPhase) ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void navigate({ to: '/settings/$section', params: { section: 'appearance' } })}
          >
            {copy.wallpaper}
          </Button>
        ) : null}
        <Button size="sm" busy={saving} onClick={onDone}>
          {copy.done}
        </Button>
      </div>

      <AppPicker
        open={pickingApp}
        onOpenChange={setPickingApp}
        apps={draft.hidden.flatMap((id) => (apps.has(id) ? [apps.get(id)!] : []))}
        onAdd={(id) =>
          onChange({
            ...draft,
            apps: [...draft.apps.filter((a) => a !== id), id],
            hidden: draft.hidden.filter((h) => h !== id),
          })
        }
      />
      <WidgetPicker
        open={picking}
        onOpenChange={setPicking}
        added={draft.widgets}
        onAdd={(id) => {
          if (draft.widgets.length >= MAX_WIDGETS || draft.widgets.includes(id)) return;
          onChange({ ...draft, widgets: [...draft.widgets, id] });
        }}
        shippedPhase={shippedPhase}
      />
    </>
  );
}
