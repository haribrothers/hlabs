// Users › Log-in screen and What members can do (US-ACCT-18…20): switches that save as they're flipped, shown at
// once and put back with an error toast if the save fails.
import type { PeoplePolicy } from '@hlabs/api';
import { Button, List, ListRow, ModalDialog, Switch } from '@hlabs/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { peopleCopy as copy } from '../copy/people';
import { errorCode } from '../lib/error-copy';
import { showToast } from '../lib/toasts';
import { useTRPC, useTRPCClient } from '../lib/trpc';

type Key = keyof PeoplePolicy;

export function usePolicy() {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();
  const key = trpc.users.getPolicy.queryKey();
  const policy = useQuery({ ...trpc.users.getPolicy.queryOptions(), retry: false });
  const update = useMutation({
    mutationFn: (change: Partial<PeoplePolicy>) => client.users.updatePolicy.mutate(change),
    onMutate: async (change) => {
      await queryClient.cancelQueries({ queryKey: key });
      const before = queryClient.getQueryData<PeoplePolicy>(key);
      if (before) queryClient.setQueryData<PeoplePolicy>(key, { ...before, ...change });
      return { before };
    },
    onError: (_err, _change, context) => {
      if (context?.before) queryClient.setQueryData(key, context.before);
    },
    onSuccess: (saved) => queryClient.setQueryData(key, saved),
  });
  return { policy, update };
}

export function PolicySwitch({
  name,
  title,
  hint,
  below,
  onFailed,
}: {
  name: Key;
  title: string;
  hint?: ReactNode;
  below?: ReactNode;
  /** A refusal this switch explains itself (else a toast). Return true when handled. */
  onFailed?: (err: unknown) => boolean;
}) {
  const { policy, update } = usePolicy();
  const on = policy.data?.[name] ?? false;
  return (
    <ListRow
      title={title}
      subtitle={hint}
      below={below}
      trailing={
        <Switch
          aria-label={title}
          checked={on}
          disabled={!policy.data}
          onChange={(next) =>
            update.mutate(
              { [name]: next },
              { onError: (err) => void (onFailed?.(err) || showToast({ tone: 'danger', title: copy.policyFailed })) },
            )
          }
        />
      }
    />
  );
}

export function LoginScreenPolicy() {
  const navigate = useNavigate();
  const [selfFirst, setSelfFirst] = useState(false);
  return (
    <>
      <List label={copy.loginScreen}>
        <PolicySwitch name="showUserList" title={copy.showUserList} hint={copy.showUserListHint} />
        <PolicySwitch
          name="requireTotp"
          title={copy.requireTotp}
          hint={copy.requireTotpHint}
          // Turning it on needs two-factor on this admin's own account first (US-ACCT-19).
          onFailed={(err) => {
            if (errorCode(err) !== 'TOTP_REQUIRED_SELF_FIRST') return false;
            setSelfFirst(true);
            return true;
          }}
        />
      </List>
      <ModalDialog
        open={selfFirst}
        onOpenChange={setSelfFirst}
        title={copy.selfFirstTitle}
        description={copy.selfFirstBody}
        actions={
          <>
            <Button variant="secondary" onClick={() => setSelfFirst(false)}>
              {copy.cancel}
            </Button>
            <Button onClick={() => void navigate({ to: '/settings/account/two-factor' })}>{copy.setUpTwoFactor}</Button>
          </>
        }
      />
    </>
  );
}
