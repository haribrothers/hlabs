// Search (US-HOME-09, US-HOME-10): ⌘K (Ctrl+K off a Mac), the Home pill or the Dock's Search opens one panel over
// the whole dashboard; the shortcut again or Escape closes it and focus goes back where it was. With nothing typed it
// lists the installed apps. ↑ ↓ move across every result, ↵ opens the highlighted one.
import { AppLogo, appTileLook, iconDefaults, Search } from '@hlabs/icons';
import { CommandPanel } from '@hlabs/ui';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { searchCopy } from '../copy/search';
import { useTRPC } from '../lib/trpc';
import { useMe } from '../lib/use-me';
import type { HomeApp } from '../home/home-app';
import { useOpenApp } from '../home/use-open-app';
import { closeSearch, isMac, isSearchShortcut, openSearch, toggleSearch, useSearchOpen } from './search-state';

const copy = searchCopy;
/** Results wait for typing to pause this long (US-HOME-10). */
export const SEARCH_DEBOUNCE_MS = 150;
const ROW_LOGO = 32;

/** A field that uses ⌘K itself opts out with this attribute (none today). */
const OWNS_SHORTCUT = '[data-owns-mod-k]';

/** The shortcut, listened for once for the whole dashboard; inside an app's frame the app keeps its keys. */
export function useSearchShortcut(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const mac = isMac();
    const onKey = (e: KeyboardEvent) => {
      if (!isSearchShortcut(e, mac)) return;
      if (e.target instanceof Element && e.target.closest(OWNS_SHORTCUT)) return;
      e.preventDefault();
      toggleSearch();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [enabled]);
}

export interface SearchItem {
  id: string;
  group: keyof typeof copy.groups;
  label: string;
  leading: ReactNode;
  /** Shown on the right; the highlighted row also shows what ↵ does. */
  trailing?: ReactNode;
  enterHint?: string;
  run: () => void;
}

export function Spotlight() {
  const open = useSearchOpen();
  const input = useRef<HTMLInputElement>(null);
  return (
    <CommandPanel
      open={open}
      onOpenChange={(next) => (next ? openSearch() : closeSearch())}
      label={copy.label}
      initialFocus={input}
    >
      {open ? <SearchBody input={input} /> : null}
    </CommandPanel>
  );
}

function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

function SearchBody({ input }: { input: React.RefObject<HTMLInputElement | null> }) {
  const trpc = useTRPC();
  const isAdmin = useMe().data?.role === 'admin';
  const openApp = useOpenApp(isAdmin);
  const [query, setQuery] = useState('');
  const settled = useDebounced(query.trim(), SEARCH_DEBOUNCE_MS);
  const results = useQuery({
    ...trpc.home.searchEverything.queryOptions({ query: settled }),
    retry: false,
    // Only the latest query's results show; the previous ones stay while the next arrive.
    placeholderData: (previous) => previous,
  });
  const [active, setActive] = useState(0);
  const listId = useId();
  const mac = isMac();

  const run = (item: SearchItem) => {
    closeSearch();
    item.run();
  };
  const items: SearchItem[] = (results.data?.installed ?? []).map((app) => appItem(app, () => openApp(app)));
  const at = items.length ? Math.min(active, items.length - 1) : -1;

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (!items.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((at + step + items.length) % items.length);
    } else if (e.key === 'Enter' && at >= 0) {
      e.preventDefault();
      run(items[at]!);
    }
  };

  const groups = (Object.keys(copy.groups) as SearchItem['group'][])
    .map((group) => ({
      group,
      entries: items.map((item, index) => ({ item, index })).filter((x) => x.item.group === group),
    }))
    .filter((g) => g.entries.length > 0);

  return (
    <>
      <div className="flex items-center gap-3 border-b border-hairline px-5 py-4">
        <Search aria-hidden {...iconDefaults} className="size-5 shrink-0 text-ink-muted" />
        <input
          ref={input}
          type="text"
          role="combobox"
          aria-label={copy.label}
          aria-expanded={items.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={at >= 0 ? `${listId}-${at}` : undefined}
          placeholder={copy.placeholder}
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          className="min-w-0 flex-1 border-0 bg-transparent text-title-3 text-ink outline-none placeholder:text-ink-muted"
        />
        <kbd className="rounded-xs bg-surface-control px-1.5 py-0.5 font-sans text-caption text-ink-muted">
          {copy.esc}
        </kbd>
      </div>
      <div id={listId} role="listbox" aria-label={copy.results} className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {groups.map(({ group, entries }) => (
          <div key={group} role="group" aria-labelledby={`${listId}-${group}`} className="pb-1">
            <div
              id={`${listId}-${group}`}
              className="px-3 pt-2 pb-1 text-caption font-bold tracking-wide text-ink-muted uppercase"
            >
              {copy.groups[group]}
            </div>
            {entries.map(({ item, index }) => (
              <div
                key={item.id}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === at}
                onMouseMove={() => setActive(index)}
                onClick={() => run(item)}
                className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-md px-3 py-2 ${
                  index === at ? 'bg-accent-wash' : ''
                }`}
              >
                {item.leading}
                <span className="min-w-0 flex-1 truncate text-body">{item.label}</span>
                {index === at && item.enterHint ? (
                  <span className="shrink-0 text-body-sm text-ink-muted">{item.enterHint} ↵</span>
                ) : item.trailing ? (
                  <span className="shrink-0 truncate text-body-sm text-ink-muted">{item.trailing}</span>
                ) : null}
              </div>
            ))}
          </div>
        ))}
      </div>
      <footer className="flex flex-wrap items-center gap-4 border-t border-hairline px-5 py-3 text-caption text-ink-muted">
        <Hint keys={['↑', '↓']} text={copy.hints.move} />
        <Hint keys={['↵']} text={copy.hints.open} />
        <Hint keys={copy.closeKeys(mac)} text={copy.hints.close} />
      </footer>
    </>
  );
}

function Hint({ keys, text }: { keys: readonly string[]; text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {keys.map((k) => (
        <kbd key={k} className="rounded-xs bg-surface-control px-1.5 py-0.5 font-sans text-caption">
          {k}
        </kbd>
      ))}
      {text}
    </span>
  );
}

function appItem(app: HomeApp, open: () => void): SearchItem {
  const look = appTileLook(app.name, app.icon, ROW_LOGO);
  return {
    id: `app:${app.id}`,
    group: 'installed',
    label: app.name,
    leading: (
      <AppLogo
        decorative
        name={app.name}
        src={app.icon.logoUrl}
        colors={look.colors}
        fallbackIcon={look.fallbackIcon}
        size={ROW_LOGO}
        radius={8}
      />
    ),
    enterHint: copy.open,
    run: open,
  };
}
