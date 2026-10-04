import { readFileSync } from 'node:fs';

/** Set by build.mjs in the bundle, which has no package.json beside it. */
declare const __HLABS_VERSION__: string | undefined;

/** The product version (one version for everything, 11-testing-release §Versioning). */
export const VERSION: string =
  process.env.HLABS_VERSION ??
  (typeof __HLABS_VERSION__ !== 'undefined'
    ? __HLABS_VERSION__
    : (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version);
