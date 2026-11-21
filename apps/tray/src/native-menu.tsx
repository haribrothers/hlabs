// The menu on a Linux desktop (US-INST-26, D-145): the desktop draws tray menus itself, so the menu this window works
// out for each state (the same as on a Mac) is mirrored into a native one. The status line is a disabled item
// ("hlabs · Running · 11 apps"), the state's action follows it ("Resume apps", "Start engine", "Restart to update"),
// then the items; a click comes back as a `native-menu` event and runs the same handler. Stats, notes and styling
// stay Mac-only. On a Mac these render as before and send nothing.
import {
  TrayMenu as UiTrayMenu,
  TraySetup as UiTraySetup,
  type MenuItem,
  type TrayMenuProps,
  type TraySetupProps,
} from '@hlabs/ui';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useEffect, useRef } from 'react';

/** A Linux desktop (WebKitGTK says so in its user agent). */
export const isLinux = () => typeof navigator !== 'undefined' && /Linux/.test(navigator.userAgent);

/** An item of the native menu, as the Rust side builds it (native_menu.rs). */
export type NativeItem =
  { kind: 'item'; id: string; label: string; enabled: boolean; checked: boolean | null } | { kind: 'separator' };

export interface NativeModel {
  status: string;
  action?: { label: string; onSelect: () => void; disabled?: boolean; busy?: boolean };
  items: MenuItem[];
}

/** The native items for a menu, and what each id runs. */
export function nativeItems(model: NativeModel): { items: NativeItem[]; handlers: Map<string, () => void> } {
  const handlers = new Map<string, () => void>();
  const items: NativeItem[] = [
    { kind: 'item', id: 'status', label: `hlabs · ${model.status}`, enabled: false, checked: null },
  ];
  if (model.action) {
    handlers.set('action', model.action.onSelect);
    items.push({
      kind: 'item',
      id: 'action',
      label: model.action.label,
      enabled: !(model.action.disabled || model.action.busy),
      checked: null,
    });
  }
  let first = true;
  model.items.forEach((item, i) => {
    if (item.separator) {
      // A separator right after the status line is the Mac menu's; the native one draws its own.
      if (!first && items.at(-1)?.kind !== 'separator') items.push({ kind: 'separator' });
      return;
    }
    first = false;
    if (typeof item.label !== 'string') return;
    const id = `item-${i}`;
    if (item.onSelect) handlers.set(id, item.onSelect);
    items.push({
      kind: 'item',
      id,
      label: item.label,
      enabled: !item.disabled && item.onSelect !== undefined,
      checked: item.checked ?? null,
    });
  });
  if (items.at(-1)?.kind === 'separator') items.pop();
  return { items, handlers };
}

/** Mirrors a menu into the native one on Linux; nothing elsewhere. */
export function useNativeMenu(model: NativeModel) {
  const linux = isLinux();
  const { items, handlers } = nativeItems(model);
  const current = useRef(handlers);
  const key = JSON.stringify(items);

  // The handlers of the latest render, for the next click.
  useEffect(() => {
    current.current = handlers;
  });

  useEffect(() => {
    if (!linux) return;
    void invoke('set_native_menu', { items: JSON.parse(key) as NativeItem[] }).catch(() => {});
  }, [linux, key]);

  useEffect(() => {
    if (!linux) return;
    const unlisten = listen<string>('native-menu', (e) => current.current.get(e.payload)?.());
    return () => void unlisten.then((stop) => stop()).catch(() => {});
  }, [linux]);
}

/** TrayMenu, also as a native menu on Linux. */
export function TrayMenu(props: TrayMenuProps) {
  useNativeMenu({ status: props.statusText, action: props.action, items: props.items });
  return <UiTrayMenu {...props} />;
}

/** TraySetup (first launch), also as a native menu on Linux: its title and its action. */
export function TraySetup({ items = [], ...props }: TraySetupProps & { items?: MenuItem[] }) {
  useNativeMenu({ status: props.title, action: props.action, items });
  return <UiTraySetup {...props} />;
}
