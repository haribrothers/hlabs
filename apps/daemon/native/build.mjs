// Builds the native helpers for this machine (D-060): on macOS, hlabs-netmount from netmount/main.swift with swiftc
// (Xcode command-line tools). Skips when the binary is newer than its source. Output: native/.build/.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'darwin') process.exit(0);
const source = fileURLToPath(new URL('./netmount/main.swift', import.meta.url));
const outDir = fileURLToPath(new URL('./.build/', import.meta.url));
const out = `${outDir}hlabs-netmount`;
if (existsSync(out) && statSync(out).mtimeMs > statSync(source).mtimeMs) process.exit(0);
mkdirSync(outDir, { recursive: true });
try {
  execFileSync('xcrun', ['swiftc', '-O', source, '-o', out], { stdio: 'inherit' });
} catch {
  process.stderr.write('hlabs-netmount was not built (install the Xcode command-line tools); NAS storage needs it.\n');
}
