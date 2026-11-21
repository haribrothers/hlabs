// Stand-in actions for the uninstall window (US-INST-21, US-INST-22): everything succeeds unless a test says otherwise.
import { vi } from 'vitest';
import type { UninstallActions, UninstallInfo } from '../src/uninstall';

const INFO: UninstallInfo = { appCount: 11, dataBytes: 97e9, storageRoot: '/Users/hari/hlabs', colimaManaged: true };

export function actions(over: Partial<UninstallActions> = {}, info: Partial<UninstallInfo> = {}): UninstallActions {
  return {
    info: vi.fn(async () => ({ ...INFO, ...info })),
    confirm: vi.fn(async () => true),
    start: vi.fn(async () => 'job1'),
    job: vi.fn(async () => ({ id: 'job1', kind: 'hlabs_uninstall', state: 'succeeded' }) as never),
    removeHlabs: vi.fn(async () => {}),
    deleteData: vi.fn(async () => {}),
    quit: vi.fn(async () => {}),
    copyDiagnostics: vi.fn(async () => {}),
    close: vi.fn(),
    ...over,
  };
}
