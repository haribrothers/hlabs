// Account › Security (US-ACCT-06, US-ACCT-08): the password row and its Change dialog, two-factor login and the
// recovery codes, which open TwoFactorManage.
import { Badge, Button, List, ListRow } from '@hlabs/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { accountCopy } from '../copy/account';
import { timeAgo } from '../lib/relative-time';
import { useTRPC } from '../lib/trpc';
import { ChangePassword } from './change-password';
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
  // Opened from Manage or View, or straight from /settings/account/two-factor.
  const [managing, setManaging] = useState(openTwoFactor);
  if (!account.data) return null;
  const a = account.data;
  const changedAt = a.passwordChangedAt;
  const on = a.totpEnabledAt !== null;
  const closeManage = () => {
    setManaging(false);
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
            <Button variant="secondary" size="sm" aria-label={copy.manageTwoFactor} onClick={() => setManaging(true)}>
              {copy.manage}
            </Button>
          ) : null
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
                onClick={() => setManaging(true)}
              >
                {copy.view}
              </Button>
            </span>
          }
        />
      ) : null}
      {changing ? <ChangePassword onClose={() => setChanging(false)} /> : null}
      {managing && on ? <TwoFactorManage account={a} onClose={closeManage} /> : null}
    </List>
  );
}
