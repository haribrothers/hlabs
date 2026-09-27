// `hlabs`: status, logs, reset-password, uninstall and setup-url (D-018). Phase 0 has the command
// skeleton only; each command ships with its story (status/logs phase 4, the rest phase 6).
import { parseArgs } from 'node:util';

export const COMMANDS = {
  status: 'Show whether hlabs and its apps are running',
  logs: 'Show hlabs logs (-f to follow, --app <id> for one app)',
  'reset-password': 'Set a new password for a user (root only on Linux)',
  uninstall: 'Remove hlabs from this server (--keep-data to keep your files)',
  'setup-url': 'Print the onboarding address with its setup token',
} as const;

export type Command = keyof typeof COMMANDS;

export interface Io {
  out: (line: string) => void;
  err: (line: string) => void;
}

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
export function run(argv: string[], io: Io): number {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    strict: false,
    options: { help: { type: 'boolean', short: 'h' } },
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
  io.err(`hlabs ${command} isn't available in this version yet.`);
  return 69;
}
