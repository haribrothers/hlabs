// `pnpm dev:tray`: runs `tauri dev` for the tray in its own process group. When it stops, tauri dev ends its whole
// process group, which would otherwise take the pnpm that started it down with SIGTERM (ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL).
// Ctrl-C is passed on to it and a stop is a clean exit. However it ends (Ctrl-C, or the tray quitting by itself with
// "Quit hlabs"), what's left of its group is stopped too, so its Vite server never stays behind holding port 5174.
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
const cleanUp = () => {
  try {
    process.kill(-child.pid!, 'SIGTERM');
  } catch {
    // Nothing left.
  }
};
child.on('exit', (code, signal) => {
  cleanUp();
  process.exit(stopping || signal ? 0 : (code ?? 0));
});
process.on('exit', cleanUp);
