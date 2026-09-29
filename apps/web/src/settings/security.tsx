// Account › Security (US-ACCT-06, US-ACCT-08): the password row and its Change dialog, two-factor login and the
// recovery codes, which open TwoFactorManage.
import { Badge, Button, List, ListRow } from '@hlabs/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { accountCopy } from '../copy/account';
import { timeAgo } from '../lib/relative-time';
import { useTRPC } from '../lib/trpc';
import { ChangePassword } from './change-password';
import { TurnOnTwoFactor } from './turn-on-two-factor';
import { TwoFactorManage } from './two-factor-manage';

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
  return (
    <List label={copy.security}>
      <ListRow
        title={copy.password}
        subtitle={changedAt === null ? copy.passwordSetUp : copy.passwordChangedAgo(timeAgo(changedAt))}
        trailing={
          <Button
            variant="secondary"
            size="sm"
            aria-label={`${copy.change} ${copy.password.toLowerCase()}`}
            onClick={() => setChanging(true)}
          >
            {copy.change}
          </Button>
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
            <Button variant="secondary" size="sm" aria-label={copy.turnOnTwoFactor} onClick={() => setDialog('turnOn')}>
              {copy.turnOn}
            </Button>
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
      {changing ? <ChangePassword onClose={() => setChanging(false)} /> : null}
      {dialog === 'manage' && on ? <TwoFactorManage account={a} onClose={closeDialog} /> : null}
      {dialog === 'turnOn' ? <TurnOnTwoFactor onClose={closeDialog} /> : null}
    </List>
  );
}
