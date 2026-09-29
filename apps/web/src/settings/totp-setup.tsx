// Pairing an authenticator app (US-ACCT-11, US-ACCT-12): the QR code, the key as text for typing in, and the
// 6-digit code that proves it worked. The wording for the QR code and key is shared with onboarding (US-ONB-11).
import { Button, CodeInput } from '@hlabs/ui';
import { TRPCClientError } from '@trpc/client';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { accountCopy } from '../copy/account';
import { onboardingCopy } from '../copy/onboarding';
import { CopyButton } from '../onboarding/copy-button';
import { groupKey } from '../onboarding/two-factor-step';

const copy = accountCopy;
const pair = onboardingCopy.twoFactor;

/** What a wrong or refused code means. */
export function codeError(err: unknown): string {
  const code = err instanceof TRPCClientError ? (err.data as { hlabsCode?: string } | undefined)?.hlabsCode : undefined;
  if (code === 'AUTH_LOCKED') return pair.locked;
  if (code === 'TOTP_INVALID_CODE') return pair.wrongCode;
  return code ? copy.somethingWrong : copy.unreachable;
}

export function TotpSetup({
  setup,
  lead,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  setup: { otpauthUrl: string; secret: string };
  lead: string;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: (code: string) => void;
}) {
  const [qr, setQr] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [code, setCode] = useState('');
  const [focusKey, setFocusKey] = useState(0);
  useEffect(() => {
    void QRCode.toDataURL(setup.otpauthUrl, { margin: 1, width: 352 }).then(setQr);
  }, [setup.otpauthUrl]);
  // A new "wrong code" clears the boxes and puts focus back on the first (adjusting state when a prop changes).
  const [seenError, setSeenError] = useState(error);
  if (error !== seenError) {
    setSeenError(error);
    if (error) {
      setCode('');
      setFocusKey((k) => k + 1);
    }
  }
  const submit = (value: string) => {
    if (value.length === 6 && !busy) onConfirm(value);
  };
  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 text-body text-ink-muted">{lead}</p>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="grid size-40 shrink-0 place-items-center rounded-lg bg-fill-primary p-2">
          {qr ? <img src={qr} alt={pair.qrAlt} className="size-full" /> : null}
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <Button variant="link" className="self-start" aria-expanded={showKey} onClick={() => setShowKey(!showKey)}>
            {pair.cantScan}
          </Button>
          {showKey ? (
            <div className="flex flex-wrap items-center gap-2">
              <code
                aria-label={pair.key}
                className="rounded-sm bg-surface-input px-3 py-2 font-mono text-mono break-all"
              >
                {groupKey(setup.secret)}
              </code>
              <CopyButton text={setup.secret} label={pair.copyKey} />
            </div>
          ) : null}
        </div>
      </div>
      <CodeInput
        label={pair.codeLabel}
        value={code}
        onChange={setCode}
        onComplete={submit}
        invalid={error !== null}
        disabled={busy}
        focusKey={focusKey}
      />
      {error ? (
        <p role="alert" className="m-0 text-body-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          {copy.cancel}
        </Button>
        <Button disabled={code.length !== 6} busy={busy} onClick={() => submit(code)}>
          {copy.confirm}
        </Button>
      </div>
    </div>
  );
}
