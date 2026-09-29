// Turn on two-factor login from Account (US-ACCT-12): password, pair the authenticator app (the same steps as moving
// to a new phone, US-ACCT-11), then the 10 new recovery codes in TwoFactorManage (US-ACCT-09).
import { ModalDialog } from '@hlabs/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { accountCopy } from '../copy/account';
import { useTRPC, useTRPCClient } from '../lib/trpc';
import { ConfirmWithPassword, passwordStepError } from './confirm-with-password';
import { codeError, TotpSetup } from './totp-setup';
import { TwoFactorManage } from './two-factor-manage';

const copy = accountCopy;

export function TurnOnTwoFactor({ onClose }: { onClose: () => void }) {
  const client = useTRPCClient();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const account = useQuery({ ...trpc.account.get.queryOptions(), retry: false });
  const [pairing, setPairing] = useState<{ otpauthUrl: string; secret: string } | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [stepError, setStepError] = useState<{ field?: string; form?: string } | null>(null);
  const [codeProblem, setCodeProblem] = useState<string | null>(null);

  const begin = useMutation({
    mutationFn: (password: string) => client.account.totp.begin.mutate({ password }),
    onSuccess: setPairing,
    onError: (err) => setStepError(passwordStepError(err)),
  });
  const confirm = useMutation({
    mutationFn: (code: string) => client.account.totp.confirm.mutate({ code }),
    onSuccess: async ({ recoveryCodes }) => {
      // Two-factor is on: the account (and "must set up two-factor", US-AUTH-10) change.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: trpc.account.get.queryKey() }),
        queryClient.invalidateQueries({ queryKey: trpc.auth.me.queryKey() }),
      ]);
      setCodes(recoveryCodes);
    },
    onError: (err) => setCodeProblem(codeError(err)),
  });

  if (codes && account.data?.totpEnabledAt != null) {
    return <TwoFactorManage account={account.data} codes={codes} onClose={onClose} />;
  }
  if (pairing) {
    return (
      <ModalDialog open onOpenChange={(open) => (open ? null : onClose())} title={copy.turnOnScanTitle}>
        <TotpSetup
          setup={pairing}
          lead={copy.turnOnLead}
          busy={confirm.isPending}
          error={codeProblem}
          onCancel={onClose}
          onConfirm={(code) => {
            setCodeProblem(null);
            confirm.mutate(code);
          }}
        />
      </ModalDialog>
    );
  }
  return (
    <ModalDialog open onOpenChange={(open) => (open ? null : onClose())} title={copy.turnOnTwoFactor}>
      <ConfirmWithPassword
        message={copy.turnOnIntro}
        confirmLabel={copy.confirm}
        busy={begin.isPending}
        error={stepError}
        onCancel={onClose}
        onConfirm={(password) => {
          setStepError(null);
          begin.mutate(password);
        }}
      />
    </ModalDialog>
  );
}
