// The real install on a Linux runner (D-140): `pnpm build:linux` first, then `pnpm --filter @hlabs/cli test:install`.
// It needs root (through sudo), systemd and Docker, and changes the machine, so it runs only in CI's install job. The
// files run one after another by name: us-inst-23 installs hlabs, and the stories after it use that install.
import { nodeTest } from '@hlabs/config/vitest';
import { BaseSequencer, type TestSpecification } from 'vitest/node';
import { defineConfig } from 'vitest/config';

class ByName extends BaseSequencer {
  override async sort(files: TestSpecification[]) {
    return [...files].sort((a, b) => a.moduleId.localeCompare(b.moduleId));
  }
}

export default defineConfig({
  test: {
    ...nodeTest,
    include: ['test/**/*.install.ts'],
    testTimeout: 600_000,
    hookTimeout: 600_000,
    fileParallelism: false,
    sequence: { sequencer: ByName },
  },
});
