#!/usr/bin/env node
import { run } from './cli';

// Exits at once: an open stdin (reset-password) or a follow loop must not keep it running.
process.exit(
  await run(process.argv.slice(2), {
    out: (line) => process.stdout.write(`${line}\n`),
    err: (line) => process.stderr.write(`${line}\n`),
  }),
);
