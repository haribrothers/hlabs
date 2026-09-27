// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { generate, TOKENS_PATH } from '../scripts/generate-tokens';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));

describe('tokens', () => {
  it('generated files are up to date with docs/design/tokens.json (run pnpm ui:tokens)', () => {
    const out = generate(JSON.parse(readFileSync(TOKENS_PATH, 'utf8')));
    expect(readFileSync(join(SRC, 'styles/tokens.css'), 'utf8')).toBe(out.tokensCss);
    expect(readFileSync(join(SRC, 'styles/theme.css'), 'utf8')).toBe(out.themeCss);
    expect(readFileSync(join(SRC, 'lib/tokens.ts'), 'utf8')).toBe(out.tokensTs);
  });

  it('themes solid and every accent set', () => {
    const css = readFileSync(join(SRC, 'styles/tokens.css'), 'utf8');
    expect(css).toMatch(/\[data-theme='solid'\] \{[^}]*--surface-window: #221b42;/);
    for (const accent of ['mint', 'amber', 'rose']) expect(css).toContain(`[data-accent='${accent}']`);
  });
});

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

describe('component source rules (CLAUDE.md UI rules)', () => {
  const sources = files(SRC).filter((f) => /\.tsx?$/.test(f) && !f.endsWith('lib/tokens.ts'));

  it('has no hex colours in components (values come from tokens)', () => {
    const offenders = sources.filter((f) =>
      /#[0-9a-fA-F]{3,8}\b/.test(readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '')),
    );
    expect(offenders).toEqual([]);
  });

  it('does no data fetching (03-monorepo dependency rules)', () => {
    const offenders = sources.filter((f) => /\bfetch\(|@trpc|@tanstack\/react-query/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
