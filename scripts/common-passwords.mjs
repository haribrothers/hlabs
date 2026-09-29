// Regenerates packages/shared/src/common-passwords.ts from the NCSC 100k list (07 §7.2, D-059).
import { writeFileSync } from 'node:fs';

const URL =
  'https://raw.githubusercontent.com/danielmiessler/SecLists/master/Passwords/Common-Credentials/100k-most-used-passwords-NCSC.txt';
const text = await (await fetch(URL)).text();
const words = [
  ...new Set(
    text
      .split(/\r?\n/)
      .filter((w) => w.length >= 12)
      .map((w) => w.toLowerCase()),
  ),
];
const body = words.map((w) => `  ${JSON.stringify(w)}`).join(',\n');
writeFileSync(
  new URL('../packages/shared/src/common-passwords.ts', import.meta.url),
  `// Generated: the entries of 12 characters or more from the UK NCSC "100k most used passwords" list
// (SecLists, Passwords/Common-Credentials/100k-most-used-passwords-NCSC.txt, MIT licence), lowercased and
// de-duplicated. Shorter entries aren't needed: every password under 12 characters is refused anyway (07 §7.2).
// Regenerate with scripts/common-passwords.mjs.
export const COMMON_PASSWORDS_12_PLUS: readonly string[] = [
${body},
];
`,
);
process.stdout.write(`${words.length} passwords\n`);
