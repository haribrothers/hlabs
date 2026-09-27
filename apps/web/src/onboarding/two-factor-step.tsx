// OnbTwoFactor (US-ONB-11): scan the QR code (or enter the key), then confirm a 6-digit code.
import { Badge, Button, CodeInput, ModalDialog } from '@hlabs/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { TRPCClientError } from '@trpc/client';
import QRCode from 'qrcode';
import { useEffect, useRef, useState } from 'react';
import { onboardingCopy } from '../copy/onboarding';
import { useTRPC } from '../lib/trpc';
import { CopyButton } from './copy-button';
import { RecoveryCodes } from './recovery-codes';
import { StepFrame } from './step-frame';

const copy = onboardingCopy.twoFactor;

/** "JBSWY3DP…" → "JBSW Y3DP …": easier to type from the screen. */
export const groupKey = (secret: string) => secret.replace(/(.{4})(?=.)/g, '$1 ');

const hlabsCode = (err: unknown) =>
  err instanceof TRPCClientError ? (err.data as { hlabsCode?: string } | undefined)?.hlabsCode : undefined;

export function TwoFactorStep() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const me = useQuery({ ...trpc.auth.me.queryOptions(), retry: false });
  const info = useQuery({ ...trpc.system.info.queryOptions(), retry: false });
  const setup = useMutation(trpc.onboarding.setupTotp.mutationOptions());
  const next = useMutation(
    trpc.onboarding.setStep.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: trpc.onboarding.status.queryKey() });
        await navigate({ to: '/setup/$step', params: { step: 'storage' } });
      },
    }),
  );
  const alreadyOn = me.data?.totpEnabled === true;
  const [qr, setQr] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [code, setCode] = useState('');
  const [focusKey, setFocusKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [skipOpen, setSkipOpen] = useState(false);

  // A new secret each time the step opens (a reload replaces it, US-ONB-11), unless two-factor is already on.
  const started = useRef(false);
  const meSettled = !me.isPending;
  useEffect(() => {
    if (started.current || !meSettled || alreadyOn) return;
    started.current = true;
    setup.mutate();
  }, [setup, meSettled, alreadyOn]);

  const otpauthUrl = setup.data?.otpauthUrl;
  useEffect(() => {
    if (!otpauthUrl) return;
    void QRCode.toDataURL(otpauthUrl, { margin: 1, width: 352 }).then(setQr);
  }, [otpauthUrl]);

  const confirm = useMutation(
    trpc.onboarding.confirmTotp.mutationOptions({
      onError: (err) => {
        setError(hlabsCode(err) === 'AUTH_LOCKED' ? copy.locked : copy.wrongCode);
        setCode('');
        setFocusKey((k) => k + 1);
      },
    }),
  );
  const submit = (value: string) => {
    if (value.length !== 6 || confirm.isPending) return;
    setError(null);
    confirm.mutate({ code: value });
  };

  const goOn = () => next.mutate({ step: 'storage' });
  const continueError = next.isError ? (
    <p role="alert" className="m-0 mt-4 text-body-sm">
      {copy.continueFailed}
    </p>
  ) : null;

  if (confirm.data) {
    return (
      <StepFrame step="twoFactor" title={copy.codesTitle}>
        <RecoveryCodes
          codes={confirm.data.recoveryCodes}
          hostname={info.data?.hostname ?? 'hlabs'}
          username={me.data?.username ?? ''}
          onContinue={goOn}
          continuing={next.isPending}
        />
        {continueError}
      </StepFrame>
    );
  }

  // Reloaded after turning it on (or came Back from storage): the codes aren't shown again (US-ONB-12, D-022).
  if (alreadyOn) {
    return (
      <StepFrame step="twoFactor" title={copy.codesTitle}>
        <p className="m-0 mt-2 text-body text-ink-muted">{copy.alreadyOn}</p>
        {continueError}
        <div className="mt-8 flex justify-end">
          <Button size="lg" onClick={goOn} disabled={next.isPending} aria-busy={next.isPending}>
            {onboardingCopy.continue}
          </Button>
        </div>
      </StepFrame>
    );
  }

  return (
    <StepFrame step="twoFactor" title={onboardingCopy.titles.twoFactor} badge={<Badge>{copy.recommended}</Badge>}>
      <p className="m-0 mt-2 text-body text-ink-muted">{copy.lead}</p>
      {setup.isError ? (
        <p role="alert" className="m-0 mt-4 text-body-sm">
          {copy.setupFailed}
        </p>
      ) : null}
      <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-center">
        <div className="grid size-44 shrink-0 place-items-center rounded-lg bg-fill-primary p-2">
          {qr ? <img src={qr} alt={copy.qrAlt} className="size-full" /> : null}
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <Button variant="link" className="self-start" aria-expanded={showKey} onClick={() => setShowKey(!showKey)}>
            {copy.cantScan}
          </Button>
          {showKey && setup.data ? (
            <div className="flex flex-wrap items-center gap-2">
              <code
                aria-label={copy.key}
                className="rounded-sm bg-surface-input px-3 py-2 font-mono text-mono break-all"
              >
                {groupKey(setup.data.secret)}
              </code>
              <CopyButton text={setup.data.secret} label={copy.copyKey} />
            </div>
          ) : null}
          <p className="m-0 text-body-sm text-ink-muted">{copy.apps}</p>
        </div>
      </div>
      <div className="mt-6 flex flex-col gap-2">
        <span className="text-label text-ink-muted" aria-hidden>
          {copy.codeLabel}
        </span>
        <CodeInput
          label={copy.codeLabel}
          value={code}
          onChange={(value) => {
            setCode(value);
            if (value) setError(null);
          }}
          onComplete={submit}
          invalid={error !== null}
          disabled={!setup.data || confirm.isPending}
          focusKey={focusKey}
        />
        {error ? (
          <p role="alert" className="m-0 text-body-sm text-danger">
            {error}
          </p>
        ) : null}
      </div>
      <div className="mt-8 flex items-center justify-between gap-4">
        <Button variant="link" onClick={() => setSkipOpen(true)}>
          {copy.skipForNow}
        </Button>
        <Button
          size="lg"
          onClick={() => submit(code)}
          disabled={code.length !== 6 || confirm.isPending}
          aria-busy={confirm.isPending}
        >
          {copy.turnOn}
        </Button>
      </div>
      {/* Skip for now (US-ONB-13): the pending secret is discarded when the step moves on. */}
      <ModalDialog
        open={skipOpen}
        onOpenChange={setSkipOpen}
        title={copy.skipTitle}
        actions={
          <>
            <Button variant="secondary" onClick={() => setSkipOpen(false)}>
              {copy.setUpNow}
            </Button>
            <Button onClick={goOn} disabled={next.isPending} aria-busy={next.isPending}>
              {copy.skip}
            </Button>
          </>
        }
      >
        {copy.skipWarning}
        {continueError}
      </ModalDialog>
    </StepFrame>
  );
}
