// Account › Security (US-ACCT-06, US-ACCT-08): the password row and its Change dialog, two-factor login and the
// recovery codes, which open TwoFactorManage.
import { iconDefaults, KeyRound, ShieldCheck, Smartphone } from '@hlabs/icons';
import { Badge, Button, InsetGroup, InsetRowButton, List, ListRow } from '@hlabs/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { accountCopy } from '../copy/account';
import { timeAgo } from '../lib/relative-time';
import { useTRPC } from '../lib/trpc';
import { useIsDesktop } from '../lib/use-media';
import { ChangePassword } from './change-password';
import { TurnOnTwoFactor } from './turn-on-two-factor';
import { TwoFactorManage } from './two-factor-manage';
import { explainHomeOnly, HomeOnly, HomeOnlyPill, useOnPublic } from '../public/home-only';
import { publicDashboardCopy as dashCopy } from '../copy/public-dashboard';

const copy = accountCopy;

/** 3 or fewer unused codes: time to make new ones. */
export const RUNNING_LOW = 3;

export function Security({
  openTwoFactor = false,
  onTwoFactorClosed,
}: {
  openTwoFactor?: boolean;
  onTwoFactorClosed?: () => void;
}) {
  const trpc = useTRPC();
  const desktop = useIsDesktop();
  // From the internet (US-SYS-47): the password and turning two-factor on or off are at home only.
  const away = useOnPublic();
  const account = useQuery({ ...trpc.account.get.queryOptions(), retry: false });
  const [changing, setChanging] = useState(false);
  // Which two-factor dialog is open: from Manage, View or Turn on, or straight from /settings/account/two-factor
  // ('auto': manage when it's on, turn on when it's off). Turning on keeps its dialog until Done.
  const [dialog, setDialog] = useState<'auto' | 'manage' | 'turnOn' | null>(openTwoFactor ? 'auto' : null);
  if (!account.data) return null;
  if (dialog === 'auto') setDialog(account.data.totpEnabledAt !== null ? 'manage' : 'turnOn');
  const a = account.data;
  const changedAt = a.passwordChangedAt;
  const on = a.totpEnabledAt !== null;
  const closeDialog = () => {
    setDialog(null);
    onTwoFactorClosed?.();
  };
  const passwordLine =
    changedAt !== null
      ? copy.passwordChangedAgo(timeAgo(changedAt))
      : a.role === 'member'
        ? copy.passwordJoined
        : copy.passwordSetUp;
  const dialogs = (
    <>
      {changing ? <ChangePassword onClose={() => setChanging(false)} /> : null}
      {dialog === 'manage' && on ? <TwoFactorManage account={a} onClose={closeDialog} /> : null}
      {dialog === 'turnOn' ? <TurnOnTwoFactor onClose={closeDialog} /> : null}
    </>
  );
  // A phone (PhoneRedesignA_Account): each row is the button, with an icon square, its state at the right and a
  // chevron; the rows keep the desktop buttons' names ("Change password", "Manage two-factor login"…).
  if (!desktop)
    return (
      <InsetGroup role="group" label={copy.security}>
        <InsetRowButton
          icon={<KeyRound aria-hidden {...iconDefaults} />}
          title={copy.password}
          subtitle={passwordLine}
          value={away ? undefined : copy.change}
          trailing={away ? <HomeOnlyPill label={dashCopy.atHomeOnly} /> : undefined}
          chevron={!away}
          aria-label={
            away
              ? dashCopy.atHomeOnlyLabel(`${copy.change} ${copy.password.toLowerCase()}`)
              : `${copy.change} ${copy.password.toLowerCase()}`
          }
          onClick={away ? () => explainHomeOnly('account.changePassword') : () => setChanging(true)}
        />
        <InsetRowButton
          icon={<Smartphone aria-hidden {...iconDefaults} />}
          title={copy.twoFactor}
          subtitle={on ? copy.authenticatorApp : undefined}
          value={on ? <span className="text-success">{copy.on}</span> : away ? undefined : copy.twoFactorOff}
          trailing={!on && away ? <HomeOnlyPill label={dashCopy.atHomeOnly} /> : undefined}
          chevron
          aria-label={on ? copy.manageTwoFactor : copy.turnOnTwoFactor}
          onClick={
            on
              ? () => setDialog('manage')
              : away
                ? () => explainHomeOnly('account.totp.begin')
                : () => setDialog('turnOn')
          }
        />
        {on ? (
          <InsetRowButton
            icon={<ShieldCheck aria-hidden {...iconDefaults} />}
            title={copy.recoveryCodes}
            subtitle={copy.unusedOf(a.recoveryCodesUnused)}
            trailing={
              a.recoveryCodesUnused <= RUNNING_LOW ? <Badge tone="warning">{copy.runningLow}</Badge> : undefined
            }
            chevron
            aria-label={copy.viewRecoveryCodes}
            onClick={() => setDialog('manage')}
          />
        ) : null}
        {dialogs}
      </InsetGroup>
    );
  return (
    <List label={copy.security}>
      <ListRow
        title={copy.password}
        subtitle={passwordLine}
        trailing={
          <HomeOnly
            procedure="account.changePassword"
            label={copy.change}
            name={`${copy.change} ${copy.password.toLowerCase()}`}
          >
            <Button
              variant="secondary"
              size="sm"
              aria-label={`${copy.change} ${copy.password.toLowerCase()}`}
              onClick={() => setChanging(true)}
            >
              {copy.change}
            </Button>
          </HomeOnly>
        }
      />
      <ListRow
        title={copy.twoFactor}
        subtitle={on ? <span className="text-success">{copy.twoFactorOn}</span> : copy.twoFactorOff}
        trailing={
          on ? (
            <Button variant="secondary" size="sm" aria-label={copy.manageTwoFactor} onClick={() => setDialog('manage')}>
              {copy.manage}
            </Button>
          ) : (
            <HomeOnly procedure="account.totp.begin" label={copy.turnOn} name={copy.turnOnTwoFactor}>
              <Button
                variant="secondary"
                size="sm"
                aria-label={copy.turnOnTwoFactor}
                onClick={() => setDialog('turnOn')}
              >
                {copy.turnOn}
              </Button>
            </HomeOnly>
          )
        }
      />
      {on ? (
        <ListRow
          title={copy.recoveryCodes}
          subtitle={copy.unusedOf(a.recoveryCodesUnused)}
          trailing={
            <span className="flex items-center gap-2">
              {a.recoveryCodesUnused <= RUNNING_LOW ? <Badge tone="warning">{copy.runningLow}</Badge> : null}
              <Button
                variant="secondary"
                size="sm"
                aria-label={copy.viewRecoveryCodes}
                onClick={() => setDialog('manage')}
              >
                {copy.view}
              </Button>
            </span>
          }
        />
      ) : null}
      {dialogs}
    </List>
  );
}
