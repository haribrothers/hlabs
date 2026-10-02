// `pnpm dev:tray`: runs `tauri dev` for the tray in its own process group. When it stops, tauri dev ends its whole
// process group, which would otherwise take the pnpm that started it down with SIGTERM (ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL).
// Ctrl-C is passed on to it and a stop is a clean exit.
//
//   node scripts/dev-tray.ts [tauri dev options]
import { spawn } from 'node:child_process';
import { join, resolve } from 'node:path';

const tray = resolve(import.meta.dirname, '../apps/tray');
const child = spawn(join(tray, 'node_modules/.bin/tauri'), ['dev', ...process.argv.slice(2)], {
  cwd: tray,
  stdio: 'inherit',
  detached: true,
});

let stopping = false;
const stop = () => {
  stopping = true;
  try {
    // The whole group: tauri dev and the Vite server it started.
    process.kill(-child.pid!, 'SIGINT');
  } catch {
    // Already gone.
  }
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
child.on('exit', (code, signal) => process.exit(stopping || signal ? 0 : (code ?? 0)));
