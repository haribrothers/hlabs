// TwoFactorManage (US-ACCT-08…12): two-factor status, the authenticator app and the recovery codes, in a dialog over
// Account. Done closes it and puts focus back on the button that opened it.
import { Smartphone, iconDefaults } from '@hlabs/icons';
import { Badge, Button, ModalDialog, TextField } from '@hlabs/ui';
import type { AppRouter } from '@hlabs/api';
import type { inferRouterOutputs } from '@trpc/server';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { accountCopy } from '../copy/account';
import { downloadText, recoveryCodesText } from '../lib/recovery-file';
import { showToast } from '../lib/toasts';
import { useTRPC, useTRPCClient } from '../lib/trpc';
import { TRPCClientError } from '@trpc/client';
import { ConfirmWithPassword, passwordStepError } from './confirm-with-password';
import { codeError, TotpSetup } from './totp-setup';

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
  const [view, setView] = useState<'overview' | 'newCodes' | 'move' | 'moveCode' | 'turnOff'>('overview');
  const [offCode, setOffCode] = useState('');
  const [pairing, setPairing] = useState<{ otpauthUrl: string; secret: string } | null>(null);
  const [codeProblem, setCodeProblem] = useState<string | null>(null);
  const [fresh, setFresh] = useState<string[] | undefined>(codes);
  const [stepError, setStepError] = useState<{ field?: string; form?: string } | null>(null);
  // Cancelling part-way changes nothing: an unconfirmed secret just expires on the server.
  const back = () => {
    setView('overview');
    setStepError(null);
    setPairing(null);
    setCodeProblem(null);
    setOffCode('');
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

  // Move to a new phone (US-ACCT-11): password, then pair the new app; the old app's codes stop working.
  const begin = useMutation({
    mutationFn: (password: string) => client.account.totp.begin.mutate({ password }),
    onSuccess: (setup) => {
      setPairing(setup);
      setView('moveCode');
    },
    onError: (err) => setStepError(passwordStepError(err)),
  });
  const pairNew = useMutation({
    mutationFn: (code: string) => client.account.totp.confirm.mutate({ code }),
    // Done: close the dialog (so the toast isn't hidden behind it) and say so.
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: trpc.account.get.queryKey() });
      onClose();
      showToast({ tone: 'success', title: copy.moved });
    },
    onError: (err) => setCodeProblem(codeError(err)),
  });

  // Turn off (US-ACCT-12): password and a current code (or a recovery code); other devices are signed out.
  const turnOff = useMutation({
    mutationFn: (password: string) => client.account.totp.disable.mutate({ password, code: offCode }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: trpc.account.get.queryKey() }),
        queryClient.invalidateQueries({ queryKey: trpc.auth.listSessions.queryKey() }),
        queryClient.invalidateQueries({ queryKey: trpc.auth.me.queryKey() }),
      ]);
      onClose();
      showToast({ tone: 'success', title: copy.turnedOff });
    },
    onError: (err) => {
      const code =
        err instanceof TRPCClientError ? (err.data as { hlabsCode?: string } | undefined)?.hlabsCode : undefined;
      if (code === 'TOTP_INVALID_CODE') setCodeProblem(copy.wrongCodeOrRecovery);
      else if (code === 'TOTP_REQUIRED_BY_ADMIN') setStepError({ form: copy.requiredByAdmin });
      else setStepError(passwordStepError(err));
    },
  });

  if (view === 'turnOff') {
    return (
      <ModalDialog open role="alertdialog" onOpenChange={(open) => (open ? null : onClose())} title={copy.turnOffTitle}>
        <ConfirmWithPassword
          message={copy.turnOffWarning}
          confirmLabel={copy.turnOffConfirm}
          destructive
          busy={turnOff.isPending}
          error={stepError}
          onCancel={back}
          onConfirm={(password) => {
            setStepError(null);
            setCodeProblem(null);
            if (offCode.trim()) turnOff.mutate(password);
            else setCodeProblem(copy.wrongCodeOrRecovery);
          }}
        >
          <TextField
            label={copy.codeOrRecovery}
            autoComplete="one-time-code"
            autoCapitalize="none"
            spellCheck={false}
            value={offCode}
            error={codeProblem ?? undefined}
            announce="polite"
            onChange={(e) => {
              setOffCode(e.target.value);
              setCodeProblem(null);
            }}
          />
        </ConfirmWithPassword>
      </ModalDialog>
    );
  }

  if (view === 'move') {
    return (
      <ModalDialog open onOpenChange={(open) => (open ? null : onClose())} title={copy.moveToNewPhone}>
        <ConfirmWithPassword
          message={copy.moveIntro}
          confirmLabel={copy.confirm}
          busy={begin.isPending}
          error={stepError}
          onCancel={back}
          onConfirm={(password) => {
            setStepError(null);
            begin.mutate(password);
          }}
        />
      </ModalDialog>
    );
  }
  if (view === 'moveCode' && pairing) {
    return (
      <ModalDialog open onOpenChange={(open) => (open ? null : onClose())} title={copy.scanTitle}>
        <TotpSetup
          setup={pairing}
          lead={copy.scanLead}
          busy={pairNew.isPending}
          error={codeProblem}
          onCancel={back}
          onConfirm={(code) => {
            setCodeProblem(null);
            pairNew.mutate(code);
          }}
        />
      </ModalDialog>
    );
  }

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
      actions={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          {account.totpRequired ? (
            <span className="flex flex-col">
              <Button variant="link" className="self-start text-danger" disabled aria-describedby="totp-required-note">
                {copy.turnOff}
              </Button>
              <span id="totp-required-note" className="text-caption text-ink-muted">
                {copy.requiredByAdmin}
              </span>
            </span>
          ) : (
            <Button variant="link" className="text-danger" onClick={() => setView('turnOff')}>
              {copy.turnOff}
            </Button>
          )}
          <Button onClick={onClose}>{copy.done}</Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="hl-list-box">
          <div className="hl-list-row">
            <Smartphone aria-hidden {...iconDefaults} />
            <span className="hl-list-text">
              <span>{copy.authenticatorApp}</span>
              <span className="hl-list-sub">{added}</span>
            </span>
            <Button variant="secondary" size="sm" onClick={() => setView('move')}>
              {copy.moveToNewPhone}
            </Button>
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
