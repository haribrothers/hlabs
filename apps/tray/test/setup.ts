import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { tauri } from './tauri';

vi.mock('@tauri-apps/api/core', () => ({ invoke: tauri.invoke }));
vi.mock('@tauri-apps/api/event', () => ({
  listen: (name: string, cb: (e: { payload: unknown }) => void) => {
    tauri.listeners.set(name, cb);
    return Promise.resolve(() => tauri.listeners.delete(name));
  },
}));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    onFocusChanged: async () => () => {},
    hide: async () => {},
    setSize: async () => {},
  }),
  LogicalSize: class {
    constructor(
      readonly width: number,
      readonly height: number,
    ) {}
  },
}));

afterEach(cleanup);
