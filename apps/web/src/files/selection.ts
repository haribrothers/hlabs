// Which items are selected (US-FILE-20): a click selects one, Cmd/Ctrl-click adds or removes one, Shift-click selects
// the range from the last item clicked, Cmd/Ctrl+A everything. Pure, so it's tested without rendering.

export interface Selection {
  /** The folder it belongs to: opening another one starts empty. */
  folder: string;
  paths: string[];
  /** Where a Shift-click range starts. */
  anchor: string | null;
}

export const emptySelection = (folder: string): Selection => ({ folder, paths: [], anchor: null });

export interface ClickMods {
  /** Cmd on a Mac, Ctrl elsewhere. */
  toggle?: boolean;
  range?: boolean;
}

export function clickSelect(sel: Selection, order: string[], path: string, mods: ClickMods = {}): Selection {
  if (mods.range && sel.anchor && order.includes(sel.anchor)) {
    const a = order.indexOf(sel.anchor);
    const b = order.indexOf(path);
    const [from, to] = a <= b ? [a, b] : [b, a];
    return { ...sel, paths: order.slice(from, to + 1) };
  }
  if (mods.toggle) return toggleSelect(sel, path);
  return { ...sel, paths: [path], anchor: path };
}

/** A checkbox, or a tap while selecting on a phone: add or remove one, keeping the rest. */
export function toggleSelect(sel: Selection, path: string): Selection {
  const has = sel.paths.includes(path);
  return { ...sel, paths: has ? sel.paths.filter((p) => p !== path) : [...sel.paths, path], anchor: path };
}

export const selectAll = (sel: Selection, order: string[]): Selection => ({
  ...sel,
  paths: [...order],
  anchor: order[0] ?? null,
});
