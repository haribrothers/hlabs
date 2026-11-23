// Main (US-HOME-01…05): the greeting over the wallpaper, the widgets row and the app grid; and its edit mode
// (US-HOME-16…19): from a tile's menu, a right-click on the wallpaper, or a long press on an empty part of Home.
import { iconDefaults, LOGO_SCALE, LogoMark, Plus, Search } from '@hlabs/icons';
import { isFeatureEnabled, VISIBLE_PHASE } from '@hlabs/shared';
import {
  Avatar,
  avatarColorFor,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  GlassCard,
  PhoneHeader,
  PhoneSection,
  tokens,
  useIsPhone,
} from '@hlabs/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { homeCopy } from '../copy/home';
import { searchCopy } from '../copy/search';
import { isMac, openSearch } from '../search/search-state';
import { useTRPC, useTRPCClient } from '../lib/trpc';
import { showToast } from '../lib/toasts';
import { editCopy } from '../copy/home-edit';
import { EditHome, type Draft } from './home-edit';
import { useMe } from '../lib/use-me';
import { useNow } from '../lib/use-now';
import { AppGrid, orderApps } from './app-grid';
import { greetingFor } from './greeting';
import { PhoneWidgetsRow, WidgetsRow } from './widgets';
import { IosInstallHint } from './ios-install-hint';
import { EngineBanner, StartEngineButton } from './engine-banner';
import { useEngineRunning } from '../lib/engine-state';
import { NotificationsBell } from './notifications';
import { useEventStream } from '../lib/use-event-stream';

/** `shippedPhase`: the phase whose controls show (tests set it; D-036). */
export function HomeView({ shippedPhase = VISIBLE_PHASE }: { shippedPhase?: number } = {}) {
  const trpc = useTRPC();
  const me = useMe();
  const queryClient = useQueryClient();
  const layout = useQuery({ ...trpc.home.getLayout.queryOptions(), retry: false });
  const apps = useQuery({ ...trpc.apps.list.queryOptions(), retry: false });
  const [progress, setProgress] = useState(() => new Map<string, number>());
  // Installed, removed or changed apps show up without a reload (US-HOME-03); installs fill their ring (US-STORE-12).
  useEventStream((event) => {
    if (event.type === 'app.installProgress') {
      const { appId, progress: pct } = event.data;
      setProgress((m) => (m.get(appId) === pct ? m : new Map(m).set(appId, pct)));
      return;
    }
    // A reinstall fills its tile's ring too (US-APP-24).
    if (event.type === 'job.progress') {
      const { kind, target, progress: pct } = event.data;
      if (kind === 'app_reinstall' && target) {
        setProgress((m) => (m.get(target) === pct ? m : new Map(m).set(target, pct)));
      }
      return;
    }
    if (event.type !== 'app.stateChanged') return;
    void queryClient.invalidateQueries({ queryKey: trpc.apps.list.queryKey() });
    void queryClient.invalidateQueries({ queryKey: trpc.home.getLayout.queryKey() });
  });
  const now = useNow();
  // The engine stopped (US-STATE-08): apps are offline, the rest of Home stays live.
  const engineDown = useEngineRunning(Boolean(me.data)) === false;
  useEffect(() => {
    document.title = homeCopy.title;
  }, []);

  const name = me.data ? me.data.displayName.trim() || me.data.username : '';
  const showGreeting = me.data?.appearance.showGreeting ?? true;
  // Nothing installed (or shared with me) yet: a welcome and where to start (US-HOME-15). Apps only removed from
  // Home still count, since apps.list is what's installed and visible, not the layout.
  const empty = apps.data?.apps.length === 0;
  const canInstall = me.data?.canInstallApps ?? false;

  // Edit mode (US-HOME-16): a copy of Home being changed; "Done" saves it, Escape throws it away. Desktop only: a
  // phone shows the layout saved there, and a long press on Home does nothing (US-PHONE-07).
  const client = useTRPCClient();
  const phone = useIsPhone();
  const editable =
    !phone && isFeatureEnabled('homeEdit', shippedPhase) && Boolean(layout.data && apps.data) && !engineDown;
  const [draft, setDraft] = useState<Draft | null>(null);
  const hidden = new Set(layout.data?.hidden ?? []);
  const shown = apps.data
    ? orderApps(
        apps.data.apps.filter((a) => !hidden.has(a.id)),
        (layout.data?.items ?? []).filter((i) => i.kind === 'app').map((i) => i.id),
      )
    : [];
  const startEdit = () => {
    if (!layout.data || !apps.data) return;
    setDraft({
      widgets: layout.data.items.filter((i) => i.kind === 'widget').map((i) => i.id),
      apps: shown.map((a) => a.id),
      hidden: layout.data.hidden,
    });
  };
  const save = useMutation({
    mutationFn: (d: Draft) =>
      client.home.saveLayout.mutate({
        items: [
          ...d.widgets.map((id) => ({ kind: 'widget' as const, id })),
          ...d.apps.map((id) => ({ kind: 'app' as const, id })),
        ],
        hidden: d.hidden,
      }),
    onSuccess: (saved) => {
      queryClient.setQueryData(trpc.home.getLayout.queryKey(), (old) => (old ? { ...old, ...saved } : old));
      setDraft(null);
    },
    // Edit mode stays open with the changes.
    onError: () => showToast({ tone: 'danger', title: editCopy.couldntSave }),
  });
  const appsById = new Map((apps.data?.apps ?? []).map((a) => [a.id, a]));
  const startEditRef = useRef(startEdit);
  useEffect(() => {
    startEditRef.current = startEdit;
  });
  const [wallpaperMenu, setWallpaperMenu] = useState<{ x: number; y: number } | null>(null);
  useEmptyAreaGestures(editable && !draft, {
    onContextMenu: (x, y) => setWallpaperMenu({ x, y }),
    onLongPress: () => startEditRef.current(),
  });

  const widgetIds = layout.data?.items.filter((i) => i.kind === 'widget').map((i) => i.id) ?? [];
  const grid = apps.data ? (
    <AppGrid
      apps={shown}
      isAdmin={me.data?.role === 'admin'}
      canInstall={canInstall}
      progress={progress}
      offline={engineDown}
      onEditHome={editable ? startEdit : undefined}
      dockDrag={!phone && isFeatureEnabled('dockPins', shippedPhase)}
    />
  ) : null;

  if (phone) {
    // PhoneHome (US-PHONE-07, US-PHONE-08, D-172): "Home" with the greeting under it, notifications and the account,
    // Search, the widgets as a row you swipe, then the apps four to a row. On the wallpaper.
    const running = shown.filter((a) => a.state === 'running').length;
    const appsLine = shown.length
      ? running === shown.length
        ? homeCopy.allRunning(shown.length)
        : homeCopy.someRunning(running, shown.length)
      : '';
    const greeting =
      name && !empty ? homeCopy.greeting[greetingFor(now)](name) : name ? homeCopy.empty.welcome(name) : '';
    return (
      <div className="flex w-full flex-col gap-4">
        <div className="flex flex-col gap-3">
          <PhoneHeader
            title={homeCopy.phoneTitle}
            trailing={
              <>
                <NotificationsBell shippedPhase={shippedPhase} inline />
                {me.data ? <AccountButton name={name} username={me.data.username} color={me.data.avatarColor} /> : null}
              </>
            }
            subtitle={
              showGreeting && greeting ? `${greeting}.${appsLine ? ` ${appsLine}` : ''}` : appsLine || undefined
            }
          />
          {isFeatureEnabled('search') ? <PhoneSearchButton /> : null}
        </div>
        <IosInstallHint shippedPhase={shippedPhase} />
        {me.data?.appearance.showWidgets !== false && layout.data ? (
          <PhoneWidgetsRow ids={widgetIds} shippedPhase={shippedPhase} />
        ) : null}
        <EngineBanner down={engineDown} actions={me.data?.role === 'admin' ? <StartEngineButton /> : null} />
        {empty ? (
          <EmptyHome canInstall={canInstall && isFeatureEnabled('appStore')} offline={engineDown} />
        ) : grid ? (
          <section aria-labelledby="phone-home-apps" className="flex flex-col gap-1.5">
            <PhoneSection id="phone-home-apps" title={homeCopy.apps} />
            {grid}
          </section>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-window flex-col items-center gap-8">
      <header className="flex flex-col items-center gap-4 text-center">
        {/* The size of a Home app icon, with the mark inset as app logos are. */}
        <GlassCard
          className="grid size-(--size-app-icon) place-items-center rounded-(--radius-icon) p-0"
          aria-hidden="true"
        >
          <LogoMark size={Math.round(tokens.SIZE_APP_ICON * LOGO_SCALE)} title="" />
        </GlassCard>
        <h1 className={showGreeting && name ? 'm-0 text-display-xl' : 'sr-only'}>
          {draft
            ? editCopy.dragToRearrange
            : name
              ? empty
                ? homeCopy.empty.welcome(name)
                : homeCopy.greeting[greetingFor(now)](name)
              : homeCopy.title}
        </h1>
        {isFeatureEnabled('search') ? <SearchPill /> : null}
      </header>
      {draft ? (
        <EditHome
          draft={draft}
          onChange={setDraft}
          apps={appsById}
          saving={save.isPending}
          onDone={() => save.mutate(draft)}
          onCancel={() => setDraft(null)}
          shippedPhase={shippedPhase}
        />
      ) : null}
      {!draft && me.data?.appearance.showWidgets !== false && layout.data ? (
        <WidgetsRow ids={widgetIds} shippedPhase={shippedPhase} />
      ) : null}
      {draft ? null : empty ? (
        <EmptyHome canInstall={canInstall && isFeatureEnabled('appStore')} offline={engineDown} />
      ) : (
        grid
      )}
      <EngineBanner down={engineDown} actions={me.data?.role === 'admin' ? <StartEngineButton /> : null} />
      <NotificationsBell shippedPhase={shippedPhase} />
      {wallpaperMenu ? (
        <DropdownMenu
          open
          onOpenChange={(o) => {
            if (!o) setWallpaperMenu(null);
          }}
          modal
        >
          <DropdownMenuTrigger asChild>
            <span
              aria-hidden
              tabIndex={-1}
              className="pointer-events-none fixed size-0"
              style={{ left: wallpaperMenu.x, top: wallpaperMenu.y }}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" aria-label={editCopy.enter} className="min-w-44">
            <DropdownMenuItem onSelect={startEdit}>{editCopy.enter}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}

/** How long a press on an empty part of Home takes to start edit mode (D-045). */
const LONG_PRESS_MS = 500;
/** A pointer that moves this far is scrolling or selecting, not pressing. */
const MOVE_PX = 10;
/** Tiles, widgets, controls and dialogs aren't the empty part of Home. */
const NOT_EMPTY = 'a, button, input, select, textarea, [role="dialog"], [role="menu"], .hl-card, .hl-app, [data-app]';

/** A right-click or a long press on Home's wallpaper, not on anything on it (US-HOME-16). */
function useEmptyAreaGestures(
  on: boolean,
  h: { onContextMenu: (x: number, y: number) => void; onLongPress: () => void },
) {
  const handlers = useRef(h);
  useEffect(() => {
    handlers.current = h;
  });
  useEffect(() => {
    const main = document.getElementById('main');
    if (!on || !main) return;
    const empty = (t: EventTarget | null) => t instanceof Element && !t.closest(NOT_EMPTY);
    let press: { timer: ReturnType<typeof setTimeout>; x: number; y: number } | null = null;
    const end = () => {
      if (press) clearTimeout(press.timer);
      press = null;
    };
    const onContext = (e: MouseEvent) => {
      if (!empty(e.target)) return;
      e.preventDefault();
      end();
      handlers.current.onContextMenu(e.clientX, e.clientY);
    };
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || !empty(e.target)) return;
      press = { x: e.clientX, y: e.clientY, timer: setTimeout(() => handlers.current.onLongPress(), LONG_PRESS_MS) };
    };
    const onMove = (e: PointerEvent) => {
      if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > MOVE_PX) end();
    };
    main.addEventListener('contextmenu', onContext);
    main.addEventListener('pointerdown', onDown);
    main.addEventListener('pointermove', onMove);
    main.addEventListener('pointerup', end);
    main.addEventListener('pointercancel', end);
    return () => {
      end();
      main.removeEventListener('contextmenu', onContext);
      main.removeEventListener('pointerdown', onDown);
      main.removeEventListener('pointermove', onMove);
      main.removeEventListener('pointerup', end);
      main.removeEventListener('pointercancel', end);
    };
  }, [on]);
}

/**
 * Home before any app (US-HOME-15; HomeEmpty): the "Install app" tile, what people usually start with and the way
 * to the App Store, or, for a member who can't install, who to ask.
 */
function EmptyHome({ canInstall, offline }: { canInstall: boolean; offline: boolean }) {
  const trpc = useTRPC();
  const account = useQuery({ ...trpc.account.get.queryOptions(), enabled: !canInstall, retry: false });
  return (
    <section
      aria-labelledby="home-empty-title"
      className="hl-glass hl-glass-1 flex w-full flex-wrap items-center gap-x-8 gap-y-4 rounded-xl border border-dashed border-border-glass px-10 py-8"
    >
      {canInstall && !offline ? (
        <Link to="/store" className="hl-app" aria-label={homeCopy.installApp}>
          <span className="hl-app-icon grid place-items-center rounded-icon border border-dashed border-border-glass">
            <Plus aria-hidden {...iconDefaults} />
          </span>
          <span className="hl-app-name">{homeCopy.installApp}</span>
        </Link>
      ) : null}
      <div className="flex min-w-0 flex-1 basis-72 flex-col gap-1.5">
        <h2 id="home-empty-title" className="m-0 text-title-2">
          {homeCopy.empty.title}
        </h2>
        <p className="m-0 text-body text-ink-muted">
          {canInstall ? homeCopy.empty.body : homeCopy.empty.askAdmin(account.data?.adminName ?? null)}
        </p>
      </div>
      {canInstall && !offline ? (
        <Link to="/store" className="hl-btn hl-btn-primary hl-btn-md hl-focus">
          {homeCopy.browseStore}
        </Link>
      ) : null}
    </section>
  );
}

/** "Search" under PhoneHome's title: Spotlight, full screen (US-PHONE-09). */
function PhoneSearchButton() {
  return (
    <button type="button" onClick={openSearch} className="hl-p-search hl-p-search-glass hl-focus">
      <Search aria-hidden {...iconDefaults} className="hl-p-search-glyph" />
      <span className="flex-1">{homeCopy.search}</span>
    </button>
  );
}

/** The person's initial beside the bell: their account (PhoneHome). */
function AccountButton({ name, username, color }: { name: string; username: string; color: string | null }) {
  return (
    <Link
      to="/settings/$section"
      params={{ section: 'account' }}
      aria-label={homeCopy.account}
      className="hl-focus rounded-pill"
    >
      <Avatar name={name || username} color={avatarColorFor(username, color)} size="md" className="hl-p-avatar" />
    </Link>
  );
}

/** "Search apps, files, settings" under the greeting, with the shortcut (US-HOME-09). */
export function SearchPill() {
  return (
    <button
      type="button"
      onClick={openSearch}
      className="hl-focus hl-glass hl-glass-1 flex min-h-11 w-full max-w-sm items-center gap-3 rounded-pill px-5 py-2.5 text-body text-ink-muted"
    >
      <Search aria-hidden {...iconDefaults} className="size-4 shrink-0" />
      <span className="flex-1 text-left">{searchCopy.pill}</span>
      <kbd aria-hidden className="rounded-xs bg-surface-control px-1.5 py-0.5 font-sans text-caption">
        {searchCopy.shortcut(isMac())}
      </kbd>
    </button>
  );
}
