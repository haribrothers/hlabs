// The real install on a Linux runner (D-140): `pnpm build:linux` first, then `pnpm --filter @hlabs/cli test:install`.
// It needs root (through sudo), systemd and Docker, and changes the machine, so it runs only in CI's install job. The
// files run one after another in ORDER: us-inst-23 installs hlabs, the next ones use it, and us-inst-22 uninstalls it.
import { nodeTest } from '@hlabs/config/vitest';
import { BaseSequencer, type TestSpecification } from 'vitest/node';
import { defineConfig } from 'vitest/config';

const ORDER = ['us-inst-23', 'us-inst-24', 'us-inst-25', 'us-inst-22'];
const rank = (file: TestSpecification) => {
  const i = ORDER.findIndex((name) => file.moduleId.includes(`/${name}.install.ts`));
  return i < 0 ? ORDER.length : i;
};

class InOrder extends BaseSequencer {
  override async sort(files: TestSpecification[]) {
    return [...files].sort((a, b) => rank(a) - rank(b) || a.moduleId.localeCompare(b.moduleId));
  }
}

export default defineConfig({
  test: {
    ...nodeTest,
    include: ['test/**/*.install.ts'],
    testTimeout: 600_000,
    hookTimeout: 600_000,
    fileParallelism: false,
    sequence: { sequencer: InOrder },
  },
});
