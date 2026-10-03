// ForgotPassword (US-AUTH-20, US-AUTH-21): hlabs has no email, so this explains the three ways a password is reset at
// home: an admin's reset link, the menu-bar app on the computer running hlabs, or the command on a Linux server. There
// is no recovery-code option: recovery codes replace two-factor only (D-009).
import { Monitor, SquareTerminal, UserCheck, iconDefaults } from '@hlabs/icons';
import { Button, GlassCard, List, ListRow } from '@hlabs/ui';
import { useState } from 'react';
import { loginCopy as copy } from '../copy/login';
import { LoginLayout } from './login-layout';
import { withNext } from './search';

/** The log-in screen "Forgot password?" was chosen on, so "Back to log in" returns there. */
export type ForgotFrom = 'username' | 'password' | 'locked';

function backTo(from: ForgotFrom | undefined, user: string | undefined, next: string | undefined) {
  const search = { ...(user ? { user } : {}), ...withNext(next) };
  switch (from) {
    case 'password':
      return { label: copy.backToLogIn, to: '/login/password', search };
    case 'locked':
      return { label: copy.backToLogIn, to: '/login/locked', search };
    case 'username':
      return { label: copy.backToLogIn, to: '/login/username', search: withNext(next) };
    default:
      return { label: copy.backToLogIn, to: '/login', search: withNext(next) };
  }
}

function CopyCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="secondary"
      onClick={() => void navigator.clipboard.writeText(command).then(() => setCopied(true))}
    >
      {copied ? copy.copied : copy.copyCommand}
    </Button>
  );
}

const icon = (Icon: typeof Monitor) => (
  <span className="grid size-11 shrink-0 place-items-center rounded-sm bg-surface-control text-ink" aria-hidden>
    <Icon {...iconDefaults} />
  </span>
);

export function ForgotView({ from, user, next }: { from?: ForgotFrom; user?: string; next?: string }) {
  const command = copy.resetCommand(user);
  return (
    <LoginLayout back={backTo(from, user, next)}>
      <h1 className="m-0 text-title-lg text-ink">{copy.forgotTitle}</h1>
      <p className="m-0 text-body text-ink-muted">{copy.forgotLead}</p>
      <GlassCard level={2} className="mt-3 w-full max-w-xl text-left">
        <List label={copy.forgotWays}>
          <ListRow leading={icon(UserCheck)} title={copy.askAdmin} subtitle={copy.askAdminText} />
          <ListRow
            leading={icon(Monitor)}
            title={copy.desktopAdmin}
            subtitle={
              <>
                {copy.desktopAdminBefore}
                <b>{copy.desktopAdminItem}</b>
                {copy.desktopAdminAfter}
              </>
            }
          />
          <ListRow
            leading={icon(SquareTerminal)}
            title={copy.serverAdmin}
            subtitle={copy.serverAdminText}
            below={
              <div className="flex flex-wrap items-center gap-3">
                <code className="rounded-xs bg-surface-input px-2 py-1 font-mono text-body-sm text-ink">{command}</code>
                <CopyCommand command={command} />
              </div>
            }
          />
        </List>
      </GlassCard>
    </LoginLayout>
  );
}
