// A phone-sized viewport for component tests (12-phone.md): matchMedia answers width queries as a 390 px wide screen
// would (the phone layout, D-054), and everything else (hover, reduced motion, display mode) as false unless given.
const NO_OP = () => {};

function matches(query: string, width: number, extra: Record<string, boolean>): boolean {
  if (query in extra) return extra[query]!;
  const max = /\(max-width:\s*(\d+)px\)/.exec(query);
  if (max) return width <= Number(max[1]);
  const min = /\(min-width:\s*(\d+)px\)/.exec(query);
  if (min) return width >= Number(min[1]);
  return false;
}

/** Puts the page on a phone until the returned function is called. `extra`: exact queries and their answers. */
export function phoneViewport(width = 390, extra: Record<string, boolean> = {}): () => void {
  const had = Object.prototype.hasOwnProperty.call(window, 'matchMedia');
  const original = window.matchMedia;
  window.matchMedia = ((query: string) => ({
    matches: matches(query, width, extra),
    media: query,
    onchange: null,
    addEventListener: NO_OP,
    removeEventListener: NO_OP,
    addListener: NO_OP,
    removeListener: NO_OP,
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
  return () => {
    if (had) window.matchMedia = original;
    else delete (window as { matchMedia?: unknown }).matchMedia;
  };
}
