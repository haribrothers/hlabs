// Login2FA (US-AUTH-08): the 6-digit code after a correct password. The recovery-code field (US-AUTH-09) swaps in
// for the digit boxes.
import { Smartphone, iconDefaults } from '@hlabs/icons';
import { Button, CodeInput, GlassCard, TextField } from '@hlabs/ui';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { TRPCClientError } from '@trpc/client';
import { useState } from 'react';
import { loginCopy } from '../copy/login';
import { useTRPCClient } from '../lib/trpc';
import { LoginLayout } from './login-layout';
import { withNext } from './search';
import { useFinishLogin } from './use-login';

const copy = loginCopy;

const hlabsCode = (err: unknown) =>
  err instanceof TRPCClientError ? (err.data as { hlabsCode?: string } | undefined)?.hlabsCode : undefined;

export function CodeView({ challenge, next, user }: { challenge: string; next?: string; user?: string }) {
  const client = useTRPCClient();
  const navigate = useNavigate();
  const finish = useFinishLogin();
  const [mode, setMode] = useState<'app' | 'recovery'>('app');
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState('');
  const [focusKey, setFocusKey] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Back, or a timed-out challenge: the password screen this log-in started on, keeping next.
  const backToPassword = (reason?: 'timeout') =>
    navigate(
      user
        ? { to: '/login/password', search: { user, ...withNext(next), ...(reason ? { reason } : {}) } }
        : { to: '/login/username', search: { ...withNext(next), ...(reason ? { reason } : {}) } },
    );

  const verify = useMutation({
    mutationFn: (value: string) => client.auth.verifyTotp.mutate({ challengeId: challenge, code: value }),
    onSuccess: ({ redirectTo }) => finish(redirectTo),
    onError: (err) => {
      const code = hlabsCode(err);
      if (code === 'AUTH_CHALLENGE_EXPIRED') {
        void backToPassword('timeout');
      } else if (code === 'AUTH_LOCKED') {
        void navigate({ to: '/login/locked', search: withNext(next) });
      } else {
        setError(
          code === 'AUTH_SECRET_UNAVAILABLE'
            ? copy.cantCheck
            : code === 'AUTH_TOTP_INVALID'
              ? copy.wrongCode
              : copy.unreachable,
        );
        setCode('');
        setFocusKey((k) => k + 1);
      }
    },
  });

  const submit = (value: string) => {
    if (value.length !== 6 || verify.isPending) return;
    setError(null);
    verify.mutate(value);
  };

  return (
    <LoginLayout>
      <GlassCard className="mb-2 grid size-18 place-items-center p-0">
        <Smartphone aria-hidden {...iconDefaults} />
      </GlassCard>
      <h1 className="m-0 text-display">{copy.codeTitle}</h1>
      <p className="m-0 text-body text-ink-muted">{mode === 'app' ? copy.codeLead : null}</p>
      <div className="mt-4 flex w-full max-w-sm flex-col items-center gap-3">
        {mode === 'app' ? (
          <CodeInput
            label={copy.codeLabel}
            value={code}
            onChange={(value) => {
              setCode(value);
              if (value) setError(null);
            }}
            onComplete={submit}
            invalid={error !== null}
            disabled={verify.isPending}
            focusKey={focusKey}
          />
        ) : (
          <TextField
            className="w-full text-left"
            label={copy.recoveryLabel}
            placeholder={copy.recoveryPlaceholder}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            value={recovery}
            onChange={(e) => setRecovery(e.target.value)}
          />
        )}
        {error ? (
          <p role="alert" className="m-0 text-body-sm text-danger">
            {error}
          </p>
        ) : null}
        <Button
          size="lg"
          className="w-full"
          disabled={mode === 'app' ? code.length !== 6 : true}
          busy={verify.isPending}
          onClick={() => submit(code)}
        >
          {copy.verify}
        </Button>
      </div>
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
