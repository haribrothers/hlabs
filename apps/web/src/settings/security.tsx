// Account › Security (US-ACCT-06, then two-factor with US-ACCT-08): the password row and its Change dialog.
import { Button, List, ListRow } from '@hlabs/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { accountCopy } from '../copy/account';
import { timeAgo } from '../lib/relative-time';
import { useTRPC } from '../lib/trpc';
import { ChangePassword } from './change-password';

const copy = accountCopy;

export function Security() {
  const trpc = useTRPC();
  const account = useQuery({ ...trpc.account.get.queryOptions(), retry: false });
  const [changing, setChanging] = useState(false);
  if (!account.data) return null;
  const changedAt = account.data.passwordChangedAt;
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
      {changing ? <ChangePassword onClose={() => setChanging(false)} /> : null}
    </List>
  );
}
