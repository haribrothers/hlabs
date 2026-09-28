// TwoFactorManage (US-ACCT-08…12): two-factor status, the authenticator app and the recovery codes, in a dialog over
// Account. Done closes it and puts focus back on the button that opened it.
import { Smartphone, iconDefaults } from '@hlabs/icons';
import { Badge, Button, ModalDialog } from '@hlabs/ui';
import type { AppRouter } from '@hlabs/api';
import type { inferRouterOutputs } from '@trpc/server';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { accountCopy } from '../copy/account';
import { downloadText, recoveryCodesText } from '../lib/recovery-file';
import { useTRPC, useTRPCClient } from '../lib/trpc';
import { ConfirmWithPassword, passwordStepError } from './confirm-with-password';

const copy = accountCopy;

export type AccountData = inferRouterOutputs<AppRouter>['account']['get'];

const dateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

/** The recovery codes file name (US-ACCT-09). */
export const recoveryFileName = (username: string) => `hlabs-recovery-codes-${username}.txt`;

/**
 * The 10 code slots (US-ACCT-09). Codes are stored hashed, so they're shown only right after they're made (`codes`);
 * otherwise each slot is masked, and used ones are struck through with "Used".
 */
function CodesBlock({ account, codes }: { account: AccountData; codes?: string[] }) {
  const slots = codes ?? account.recoveryCodesUsed.map(() => null);
  return (
    <div className="hl-print-area flex flex-col gap-2">
      <h3 className="m-0 text-label text-ink-muted">
        {copy.recoveryTitle(codes ? codes.length : account.recoveryCodesUnused)}
      </h3>
      <ul
        aria-label={copy.codesList}
        className="m-0 grid list-none grid-cols-2 gap-x-6 gap-y-2 rounded-md bg-surface-input p-4 font-mono text-mono"
      >
        {slots.map((code, i) => {
          const used = !codes && account.recoveryCodesUsed[i];
          return (
            <li key={code ?? i} className={used ? 'text-ink-muted line-through' : undefined}>
              {code ?? <span aria-label={copy.hiddenCode}>••••-••••</span>}
              {used ? <span className="ml-2 font-sans text-caption no-underline">{copy.used}</span> : null}
            </li>
          );
        })}
      </ul>
      <p className="m-0 text-body-sm text-ink-muted">{copy.codesHelp}</p>
    </div>
  );
}

export function TwoFactorManage({
  account,
  codes,
  onClose,
}: {
  account: AccountData;
  /** Plain codes, only right after they're made; they live in memory and go when the dialog closes. */
  codes?: string[];
  onClose: () => void;
}) {
  const client = useTRPCClient();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  // Which step the dialog shows; plain codes live only here and go when the dialog closes.
  const [view, setView] = useState<'overview' | 'newCodes'>('overview');
  const [fresh, setFresh] = useState<string[] | undefined>(codes);
  const [stepError, setStepError] = useState<{ field?: string; form?: string } | null>(null);
  const back = () => {
    setView('overview');
    setStepError(null);
  };

  // Make new codes (US-ACCT-10): the old ones stop working, the new ones show once.
  const regenerate = useMutation({
    mutationFn: (password: string) => client.account.recoveryCodes.regenerate.mutate({ password }),
    onSuccess: async ({ recoveryCodes }) => {
      setFresh(recoveryCodes);
      back();
      await queryClient.invalidateQueries({ queryKey: trpc.account.get.queryKey() });
    },
    onError: (err) => setStepError(passwordStepError(err)),
  });

  if (view === 'newCodes') {
    return (
      <ModalDialog open onOpenChange={(open) => (open ? null : onClose())} title={copy.makeNewCodes}>
        <ConfirmWithPassword
          message={copy.oldCodesStop}
          confirmLabel={copy.makeNewCodes}
          busy={regenerate.isPending}
          error={stepError}
          onCancel={back}
          onConfirm={(password) => {
            setStepError(null);
            regenerate.mutate(password);
          }}
        />
      </ModalDialog>
    );
  }

  const added =
    account.totpAddedDuringSetup || account.totpEnabledAt === null
      ? copy.addedAtSetup
      : copy.addedOn(dateFormat.format(account.totpEnabledAt));
  return (
    <ModalDialog
      open
      onOpenChange={(open) => (open ? null : onClose())}
      title={
        <span className="flex items-center justify-between gap-3">
          {copy.twoFactor}
          <Badge tone="success">{copy.on}</Badge>
        </span>
      }
      actions={<Button onClick={onClose}>{copy.done}</Button>}
    >
      <div className="flex flex-col gap-4">
        <div className="hl-list-box">
          <div className="hl-list-row">
            <Smartphone aria-hidden {...iconDefaults} />
            <span className="hl-list-text">
              <span>{copy.authenticatorApp}</span>
              <span className="hl-list-sub">{added}</span>
            </span>
          </div>
        </div>
        <CodesBlock account={account} codes={fresh} />
        <div className="flex flex-wrap gap-2">
          {/* Download and Print need the codes in plain text, which exist only right after they're made. */}
          <span title={fresh ? undefined : copy.seeAgain}>
            <Button
              variant="secondary"
              size="sm"
              disabled={!fresh}
              aria-description={fresh ? undefined : copy.seeAgain}
              onClick={() =>
                fresh &&
                downloadText(
                  recoveryCodesText({
                    hostname: account.hostname,
                    username: account.username,
                    date: new Date(),
                    codes: fresh,
                  }),
                  recoveryFileName(account.username),
                )
              }
            >
              {copy.download}
            </Button>
          </span>
          <span title={fresh ? undefined : copy.seeAgain}>
            <Button
              variant="secondary"
              size="sm"
              disabled={!fresh}
              aria-description={fresh ? undefined : copy.seeAgain}
              onClick={() => window.print()}
            >
              {copy.print}
            </Button>
          </span>
          <Button variant="secondary" size="sm" onClick={() => setView('newCodes')}>
            {copy.makeNewCodes}
          </Button>
        </div>
      </div>
    </ModalDialog>
  );
}
