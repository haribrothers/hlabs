import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { resetOpenWindows } from './apps/open-windows';

// Open app windows live for the browser tab (US-HOME-23); each test starts with none.
afterEach(() => resetOpenWindows());
