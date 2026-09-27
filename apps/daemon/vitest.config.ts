import { nodeTest } from '@hlabs/config/vitest';
import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { ...nodeTest, testTimeout: 15_000 } });
