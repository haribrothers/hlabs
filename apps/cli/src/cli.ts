// `hlabs`: status, logs, reset-password, uninstall and setup-url (D-018). Each command ships with its story:
// setup-url with US-INST-24, status, logs and reset-password with US-INST-25, uninstall with phase 6's uninstall step.
// They talk to hlabsd on loopback with the tray token (D-035), so they work for root and the hlabs group.
import { parseArgs } from 'node:util';
import { clientOptions, CliError, daemonClient, type DaemonClient } from './daemon';
import type { Io } from './io';
import { appLogs, daemonLogs } from './logs';
import { terminalPrompt, type Prompt } from './prompt';
import { resetPassword } from './reset-password';
import { status } from './status';

export const COMMANDS = {
  status: 'Show whether hlabs and its apps are running',
  logs: 'Show hlabs logs (-f to follow, --app <id> for one app)',
  'reset-password': 'Set a new password for a user (root only on Linux)',
  uninstall: 'Remove hlabs from this server (--keep-data to keep your files)',
  'setup-url': 'Print the onboarding address with its setup token',
} as const;

export type Command = keyof typeof COMMANDS;

export type { Io } from './io';

export interface Deps {
  client: () => DaemonClient;
  sleep: (ms: number) => Promise<void>;
  prompt: () => Prompt;
  /** Root on Linux: sudo is the proof of local access for reset-password (D-035). */
  isRoot: () => boolean;
  /** `/var/lib/hlabs` (HLABS_DATA_DIR in development and tests). */
  dataDir: string;
  now: () => number;
  /** Following logs stops when this is aborted (tests); Ctrl-C ends the process otherwise. */
  signal?: AbortSignal;
}

const defaultDeps = (): Deps => ({
  client: () => daemonClient(clientOptions()),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  prompt: () => terminalPrompt(),
  isRoot: () => process.getuid?.() === 0,
  dataDir: clientOptions().dataDir,
  now: Date.now,
});

export function help(): string {
  const width = Math.max(...Object.keys(COMMANDS).map((c) => c.length));
  return [
    'Usage: hlabs <command> [options]',
    '',
    'Commands:',
    ...Object.entries(COMMANDS).map(([c, d]) => `  ${c.padEnd(width)}  ${d}`),
  ].join('\n');
}

/** Runs the CLI and returns the exit code. */
export async function run(argv: string[], io: Io, deps: Deps = defaultDeps()): Promise<number> {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    strict: false,
    options: {
      help: { type: 'boolean', short: 'h' },
      installer: { type: 'boolean' },
      follow: { type: 'boolean', short: 'f' },
      app: { type: 'string' },
    },
  });
  const [command] = positionals;
  if (!command || values.help) {
    io.out(help());
    return command || values.help ? 0 : 1;
  }
  if (!(command in COMMANDS)) {
    io.err(`Unknown command "${command}". Run hlabs --help to see the commands.`);
    return 2;
  }
  try {
    if (command === 'setup-url') return await setupUrl(io, deps, values.installer === true);
    if (command === 'status') return await status(io, deps.client(), deps.now());
    if (command === 'logs') {
      const follow = values.follow === true;
      if (typeof values.app === 'string') return await appLogs(io, deps.client(), values.app, follow, deps);
      return await daemonLogs(io, deps.dataDir, follow, deps);
    }
    if (command === 'reset-password') return await resetPassword(io, deps.client(), deps.prompt(), deps.isRoot());
  } catch (err) {
    if (!(err instanceof CliError)) throw err;
    io.err(err.message);
    return err.code;
  }
  io.err(`hlabs ${command} isn't available in this version yet.`);
  return 69;
}

interface SetupUrls {
  url: string | null;
  lanUrls: string[];
  mdnsUrl: string | null;
}

/** How long the installer waits for hlabs.local to be announced (US-INST-24). */
export const ANNOUNCE_WAIT_MS = 10_000;
/** A name that's still announced this much later stays announced (a publisher that fails stops at once). */
export const ANNOUNCE_SETTLE_MS = 2_000;

/**
 * US-INST-24: where to finish setup, at the `.local` name and each LAN address, until onboarding is done. The installer
 * (`--installer`) first waits for the name to be announced and says whether it was.
 */
async function setupUrl(io: Io, deps: Deps, installer: boolean): Promise<number> {
  const client = deps.client();
  const ask = () => client.query<SetupUrls>('tray.setupUrl');
  let urls = await ask();
  if (urls.url === null) {
    const { dashboardUrl } = await client.query<{ dashboardUrl: string }>('tray.status');
    io.out(`Setup is finished. Open hlabs at ${dashboardUrl}`);
    return 0;
  }
  if (installer) {
    for (
      let waited = 0;
      urls.mdnsUrl === null && urls.lanUrls.length > 0 && waited < ANNOUNCE_WAIT_MS;
      waited += 1_000
    ) {
      await deps.sleep(1_000);
      urls = await ask();
    }
    if (urls.mdnsUrl !== null) {
      await deps.sleep(ANNOUNCE_SETTLE_MS);
      urls = await ask();
    }
    if (urls.mdnsUrl !== null) io.out(`✓ Announced ${new URL(urls.mdnsUrl).hostname} on your network`);
    else if (urls.lanUrls.length > 0) {
      io.out("! The .local name isn't available on this network (is Avahi running?), so use the IP address");
    }
  }
  const all = [...(urls.mdnsUrl ? [urls.mdnsUrl] : []), ...urls.lanUrls];
  io.out('Finish setup in your browser:');
  if (all.length === 0) io.out(`  ${urls.url}`);
  all.forEach((url, i) => io.out(`  ${i === 0 ? '' : 'or '}${url}`));
  return 0;
}
