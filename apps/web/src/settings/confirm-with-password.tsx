// A step inside TwoFactorManage that asks for the password first (US-ACCT-10, 11, 12). A wrong password counts
// toward the log-in lockout on the server; the field says what went wrong.
import { Button, TextField } from '@hlabs/ui';
import { TRPCClientError } from '@trpc/client';
import { useState, type FormEvent, type ReactNode } from 'react';
import { accountCopy } from '../copy/account';
import { PasswordReveal } from '../shell/password-reveal';

const copy = accountCopy;

/** What a password-confirmed call's error means for this person. */
export function passwordStepError(err: unknown): { field?: string; form?: string } {
  const data = err instanceof TRPCClientError ? (err.data as { hlabsCode?: string; detail?: unknown }) : null;
  if (data?.hlabsCode === 'AUTH_INVALID_PASSWORD') return { field: copy.wrongPassword };
  if (data?.hlabsCode === 'AUTH_LOCKED') {
    const seconds = (data.detail as { retryAfterSeconds?: number } | null)?.retryAfterSeconds ?? 900;
    return { form: copy.tooManyAttempts(Math.max(1, Math.ceil(seconds / 60))) };
  }
  return { form: data ? copy.somethingWrong : copy.unreachable };
}

export function ConfirmWithPassword({
  message,
  confirmLabel,
  destructive = false,
  busy,
  error,
  onCancel,
  onConfirm,
  children,
}: {
  message: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  busy: boolean;
  error: { field?: string; form?: string } | null;
  onCancel: () => void;
  onConfirm: (password: string) => void;
  /** More fields (e.g. a code), under the password. */
  children?: ReactNode;
}) {
  const [password, setPassword] = useState('');
  const [shown, setShown] = useState(false);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (password && !busy) onConfirm(password);
  };
  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <p className="m-0 text-body">{message}</p>
      <TextField
        label={copy.yourPassword}
        type={shown ? 'text' : 'password'}
        autoComplete="current-password"
        autoFocus
        value={password}
        error={error?.field}
        announce="polite"
        onChange={(e) => setPassword(e.target.value)}
        trailing={<PasswordReveal shown={shown} onToggle={() => setShown(!shown)} />}
      />
      {children}
      {error?.form ? (
        <p role="alert" className="m-0 text-body-sm text-danger">
          {error.form}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          {copy.cancel}
        </Button>
        <Button type="submit" variant={destructive ? 'destructive' : 'primary'} disabled={!password} busy={busy}>
          {confirmLabel}
        </Button>
      </div>
    </form>
  );
}
