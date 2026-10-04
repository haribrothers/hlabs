// Comparing hlabs versions (semver: 1.4.0, 1.5.0-beta.2). A release beats its own pre-releases; pre-release parts
// compare as numbers when both are numbers, else as text.

function parse(v: string) {
  const [core = '', pre] = v.trim().replace(/^v/, '').split('+')[0]!.split(/-(.*)/s);
  return { core: core.split('.').map((n) => Number.parseInt(n, 10) || 0), pre: pre ? pre.split('.') : [] };
}

/** Negative when a is older than b, 0 when the same, positive when newer. */
export function compareVersions(a: string, b: string): number {
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < 3; i++) {
    const d = (x.core[i] ?? 0) - (y.core[i] ?? 0);
    if (d) return d;
  }
  if (!x.pre.length || !y.pre.length) return y.pre.length - x.pre.length;
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    const p = x.pre[i];
    const q = y.pre[i];
    if (p === undefined) return -1;
    if (q === undefined) return 1;
    const [m, n] = [Number(p), Number(q)];
    const d = Number.isInteger(m) && Number.isInteger(n) ? m - n : p.localeCompare(q);
    if (d) return d;
  }
  return 0;
}
