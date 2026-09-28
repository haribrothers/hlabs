// Login2FA (US-AUTH-08, US-AUTH-09): the 6-digit code after a correct password, or one of the saved recovery codes
// in its place.
import { Smartphone, iconDefaults } from '@hlabs/icons';
import { Button, CodeInput, GlassCard, TextField } from '@hlabs/ui';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { TRPCClientError } from '@trpc/client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { loginCopy } from '../copy/login';
import { showToast } from '../lib/toasts';
import { useTRPCClient } from '../lib/trpc';
import { LoginLayout } from './login-layout';
import { withNext } from './search';
import { useFinishLogin } from './use-login';

const copy = loginCopy;

/** Where "Make new codes" goes: TwoFactorManage (US-ACCT-08). */
export const TWO_FACTOR_MANAGE_PATH = '/settings/account/two-factor';

const hlabsCode = (err: unknown) =>
  err instanceof TRPCClientError ? (err.data as { hlabsCode?: string } | undefined)?.hlabsCode : undefined;

const FAILURE_COPY: Record<string, string> = {
  AUTH_SECRET_UNAVAILABLE: copy.cantCheck,
  AUTH_TOTP_INVALID: copy.wrongCode,
  AUTH_RECOVERY_INVALID: copy.wrongRecovery,
};

export function CodeView({ challenge, next, user }: { challenge: string; next?: string; user?: string }) {
  const client = useTRPCClient();
  const navigate = useNavigate();
  const finish = useFinishLogin();
  const [mode, setMode] = useState<'app' | 'recovery'>('app');
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState('');
  const [focusKey, setFocusKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recoveryField = useRef<HTMLInputElement>(null);

  // The recovery field takes focus when it swaps in, and again after a wrong code.
  useEffect(() => {
    if (mode === 'recovery') {
      recoveryField.current?.focus();
      recoveryField.current?.select();
    }
  }, [mode, focusKey]);

  // Back, or a timed-out challenge: the password screen this log-in started on, keeping next.
  const backToPassword = (reason?: 'timeout') =>
    navigate(
      user
        ? { to: '/login/password', search: { user, ...withNext(next), ...(reason ? { reason } : {}) } }
        : { to: '/login/username', search: { ...withNext(next), ...(reason ? { reason } : {}) } },
    );

  const failed = (err: unknown) => {
    const code = hlabsCode(err);
    if (code === 'AUTH_CHALLENGE_EXPIRED') {
      void backToPassword('timeout');
    } else if (code === 'AUTH_LOCKED') {
      void navigate({ to: '/login/locked', search: withNext(next) });
    } else {
      setError((code && FAILURE_COPY[code]) ?? copy.unreachable);
      setCode('');
      setFocusKey((k) => k + 1);
    }
  };

  const verify = useMutation({
    mutationFn: (value: string) => client.auth.verifyTotp.mutate({ challengeId: challenge, code: value }),
    onSuccess: ({ redirectTo }) => finish(redirectTo),
    onError: failed,
  });

  const recover = useMutation({
    mutationFn: (value: string) => client.auth.useRecoveryCode.mutate({ challengeId: challenge, code: value }),
    onSuccess: async ({ redirectTo, recoveryCodesLeft }) => {
      await finish(redirectTo);
      const low = recoveryCodesLeft <= 2;
      showToast({
        tone: low ? 'warning' : 'success',
        title: copy.recoveryUsed(recoveryCodesLeft),
        ...(low ? { body: copy.recoveryLow, action: { label: copy.manageCodes, to: TWO_FACTOR_MANAGE_PATH } } : {}),
      });
    },
    onError: failed,
  });
  const pending = verify.isPending || recover.isPending;

  const submitCode = (value: string) => {
    if (value.length !== 6 || pending) return;
    setError(null);
    verify.mutate(value);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (mode === 'app') {
      submitCode(code);
    } else if (recovery.trim() && !pending) {
      setError(null);
      recover.mutate(recovery);
    }
  };

  return (
    <LoginLayout>
      <GlassCard className="mb-2 grid size-18 place-items-center p-0">
        <Smartphone aria-hidden {...iconDefaults} />
      </GlassCard>
      <h1 className="m-0 text-display">{copy.codeTitle}</h1>
      {mode === 'app' ? <p className="m-0 text-body text-ink-muted">{copy.codeLead}</p> : null}
      <form className="mt-4 flex w-full max-w-sm flex-col items-center gap-3" onSubmit={submit}>
        {mode === 'app' ? (
          <CodeInput
            label={copy.codeLabel}
            value={code}
            onChange={(value) => {
              setCode(value);
              if (value) setError(null);
            }}
            onComplete={submitCode}
            invalid={error !== null}
            disabled={pending}
            focusKey={focusKey}
          />
        ) : (
          <TextField
            ref={recoveryField}
            className="w-full text-left"
            label={copy.recoveryLabel}
            placeholder={copy.recoveryPlaceholder}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            readOnly={pending}
            value={recovery}
            onChange={(e) => {
              setRecovery(e.target.value);
              setError(null);
            }}
          />
        )}
        {error ? (
          <p role="alert" className="m-0 text-body-sm text-danger">
            {error}
          </p>
        ) : null}
        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={mode === 'app' ? code.length !== 6 : !recovery.trim()}
          busy={pending}
        >
          {copy.verify}
        </Button>
      </form>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-body-sm">
        <Button variant="link" onClick={() => void backToPassword()}>
          {copy.back}
        </Button>
        <Button
          variant="link"
          onClick={() => {
            setMode(mode === 'app' ? 'recovery' : 'app');
            setError(null);
            setFocusKey((k) => k + 1);
          }}
        >
          {mode === 'app' ? copy.useRecovery : copy.useApp}
        </Button>
      </div>
    </LoginLayout>
  );
}
