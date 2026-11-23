// ForgotPassword (US-AUTH-20, US-AUTH-21): hlabs has no email, so this explains the three ways a password is reset at
// home: an admin's reset link, the menu-bar app on the computer running hlabs, or the command on a Linux server. There
// is no recovery-code option: recovery codes replace two-factor only (D-009).
import { Monitor, SquareTerminal, UserCheck, iconDefaults } from '@hlabs/icons';
import { Button, GlassCard, List, ListRow, useIsPhone } from '@hlabs/ui';
import { useState, type ReactNode } from 'react';
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
  const phone = useIsPhone();
  if (phone) {
    // ForgotPassword on a phone (US-PHONE-06, PhoneRedesignA_ForgotPassword): a full-screen page with "‹ Log in",
    // the same three ways as 03-sign-in.md, each in a card of its own. No recovery-code way: those replace two-factor
    // only (D-009), so the frame's "Use a recovery code" row isn't here.
    const card = (Icon: typeof Monitor, title: string, body: ReactNode, below?: ReactNode) => (
      <li className="flex gap-3 rounded-sm bg-solid-widget p-4">
        <span aria-hidden className="hl-p-sq">
          <Icon {...iconDefaults} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="m-0 text-row font-semibold">{title}</h2>
          <p className="m-0 text-row text-ink-muted">{body}</p>
          {below}
        </div>
      </li>
    );
    return (
      <LoginLayout back={{ ...backTo(from, user, next), label: copy.logIn }}>
        <div className="flex flex-col gap-1">
          <h1 className="hl-p-large">{copy.forgotTitle}</h1>
          <p className="m-0 text-row text-ink-muted">{copy.forgotLead}</p>
        </div>
        <ul aria-label={copy.forgotWays} className="m-0 flex list-none flex-col gap-3 p-0">
          {card(UserCheck, copy.askAdmin, copy.askAdminText)}
          {card(
            Monitor,
            copy.desktopAdmin,
            <>
              {copy.desktopAdminBefore}
              <b className="text-ink">{copy.desktopAdminItem}</b>
              {copy.desktopAdminAfter}
            </>,
          )}
          {card(
            SquareTerminal,
            copy.serverAdmin,
            copy.serverAdminText,
            <div className="mt-1 flex flex-col items-start gap-2">
              <code className="block max-w-full overflow-x-auto rounded-xs bg-solid-input px-3 py-2 font-mono text-subhead text-ink">
                {command}
              </code>
              <CopyCommand command={command} />
            </div>,
          )}
        </ul>
      </LoginLayout>
    );
  }
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
