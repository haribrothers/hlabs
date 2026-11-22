// `hlabs reset-password` (US-INST-25): root only, because sudo is the proof of local access on a server without a
// desktop (07 §7.2, D-035). Choose the account from a numbered list, type the new password twice (the rules of
// US-INST-17), optionally turn two-factor off, and the daemon applies it as the tray's reset does (US-INST-18).
import type { TrayUser } from '@hlabs/api';
import { passwordIssue } from '@hlabs/shared';
import type { Io } from './io';
import { CliError, DaemonError, NO_ACCESS, type DaemonClient } from './daemon';
import type { Prompt } from './prompt';

export async function resetPassword(io: Io, client: DaemonClient, prompt: Prompt, isRoot: boolean): Promise<number> {
  if (!isRoot) throw new CliError('Run with sudo to reset a password', NO_ACCESS);
  const { users } = await client.query<{ users: TrayUser[] }>('tray.listUsers');
  if (users.length === 0) throw new CliError('There are no accounts yet. Finish setup first: hlabs setup-url');

  io.out('Which account?');
  users.forEach((u, i) =>
    io.out(`  ${i + 1}. ${u.displayName} (@${u.username}) · ${u.role === 'admin' ? 'Admin' : 'Member'}`),
  );
  let user: TrayUser | undefined;
  while (!user) {
    const answer = (await prompt(`Account [1-${users.length}]: `)).trim();
    user = /^\d+$/.test(answer) ? users[Number(answer) - 1] : undefined;
    if (!user) io.err(`Type a number from 1 to ${users.length}`);
  }

  let password: string | undefined;
  while (password === undefined) {
    const typed = await prompt('New password: ', { hidden: true });
    const issue = passwordIssue(typed);
    if (issue) {
      io.err(issue === 'tooShort' ? 'Use at least 12 characters' : 'This password is too common');
      continue;
    }
    if ((await prompt('Type it again: ', { hidden: true })) !== typed) {
      io.err("The passwords don't match. Try again.");
      continue;
    }
    password = typed;
  }

  const disableTotp = user.totpEnabled && /^y(es)?$/i.test((await prompt('Also turn off two-factor? [y/N] ')).trim());
  try {
    await client.mutate('tray.resetPassword', {
      username: user.username,
      newPassword: password,
      disableTotp,
      via: 'cli',
    });
  } catch (err) {
    if (err instanceof DaemonError && err.hlabsCode === 'NOT_FOUND')
      throw new CliError('This account no longer exists.');
    throw err;
  }
  io.out(
    `✓ Reset the password for @${user.username}. They're signed out everywhere${disableTotp ? ' and two-factor is off' : ''}.`,
  );
  return 0;
}
