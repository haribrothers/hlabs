import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/react';
import { afterEach } from 'vitest';
import { resetOpenWindows } from './apps/open-windows';

// Open app windows live for the browser tab (US-HOME-23); each test starts with none.
afterEach(() => resetOpenWindows());

// findBy… and waitFor wait up to 3 s, not 1: a screen's first render can take longer than that on a busy CI runner
// (the macOS one especially), while the tests' own 5 s timeout still catches anything that never shows.
configure({ asyncUtilTimeout: 3_000 });
