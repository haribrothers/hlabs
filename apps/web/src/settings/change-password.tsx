// ChangePassword (US-ACCT-06, US-ACCT-07): current, new (with a length hint) and confirm; other devices are always
// signed out (07 §7.3), so that box is checked and can't be changed. Problems show on the field they're about; the
// server has the last word (the client checks are hints).
import { passwordIssue, PASSWORD_MIN_LENGTH } from '@hlabs/shared';
import { Button, ModalDialog, TextField } from '@hlabs/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { TRPCClientError } from '@trpc/client';
import { useId, useState, type FormEvent } from 'react';
import { accountCopy } from '../copy/account';
import { showToast } from '../lib/toasts';
import { useTRPC, useTRPCClient } from '../lib/trpc';
import { PasswordReveal } from '../shell/password-reveal';

const copy = accountCopy;
type Field = 'current' | 'next' | 'confirm';

export function ChangePassword({ onClose }: { onClose: () => void }) {
  const client = useTRPCClient();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const formId = useId();
  const [values, setValues] = useState<Record<Field, string>>({ current: '', next: '', confirm: '' });
  const [shown, setShown] = useState<Record<Field, boolean>>({ current: false, next: false, confirm: false });
  const [error, setError] = useState<string | null>(null);
  // From the server: wrong current password, or a new one it refused.
  const [fieldError, setFieldError] = useState<{ field: Field; message: string } | null>(null);
  // "Passwords don't match" shows once the confirm field is left, or on submit.
  const [confirmTouched, setConfirmTouched] = useState(false);
  const ready =
    values.current !== '' && passwordIssue(values.next) === null && values.confirm === values.next && !fieldError;

  const change = useMutation({
    mutationFn: () =>
      client.account.changePassword.mutate({ currentPassword: values.current, newPassword: values.next }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: trpc.account.get.queryKey() }),
        queryClient.invalidateQueries({ queryKey: trpc.auth.listSessions.queryKey() }),
      ]);
      onClose();
      showToast({ tone: 'success', title: copy.passwordChanged });
    },
    onError: (err) => {
      const data = err instanceof TRPCClientError ? (err.data as { hlabsCode?: string; detail?: unknown }) : null;
      switch (data?.hlabsCode) {
        case 'AUTH_INVALID_PASSWORD':
          return setFieldError({ field: 'current', message: copy.wrongCurrent });
        case 'PASSWORD_TOO_COMMON':
          return setFieldError({ field: 'next', message: copy.tooCommon });
        case 'PASSWORD_UNCHANGED':
          return setFieldError({ field: 'next', message: copy.unchanged });
        case 'PASSWORD_TOO_SHORT':
          return setFieldError({ field: 'next', message: copy.tooShort });
        case 'AUTH_LOCKED': {
          const seconds = (data.detail as { retryAfterSeconds?: number } | null)?.retryAfterSeconds ?? 900;
          return setError(copy.tooManyAttempts(Math.max(1, Math.ceil(seconds / 60))));
        }
        default:
          return setError(data ? copy.changeFailed : copy.unreachable);
      }
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setConfirmTouched(true);
    if (!ready || change.isPending) return;
    setError(null);
    setFieldError(null);
    change.mutate();
  };

  const field = (name: Field, label: string, autoComplete: string, hint?: string, error?: string) => (
    <TextField
      label={label}
      type={shown[name] ? 'text' : 'password'}
      autoComplete={autoComplete}
      value={values[name]}
      hint={hint}
      error={error}
      announce="polite"
      onBlur={name === 'confirm' ? () => setConfirmTouched(true) : undefined}
      onChange={(e) => {
        setValues((v) => ({ ...v, [name]: e.target.value }));
        // Fixing a field clears what the server said about it; the other fields keep what was typed.
        if (fieldError?.field === name) setFieldError(null);
      }}
      trailing={<PasswordReveal shown={shown[name]} onToggle={() => setShown((s) => ({ ...s, [name]: !s[name] }))} />}
    />
  );
  const strength =
    values.next === '' ? undefined : [...values.next].length >= PASSWORD_MIN_LENGTH ? copy.strong : copy.tooShort;
  const errorFor = (name: Field): string | undefined => {
    if (fieldError?.field === name) return fieldError.message;
    if (name === 'next' && passwordIssue(values.next) === 'tooCommon') return copy.tooCommon;
    if (name === 'confirm' && confirmTouched && values.confirm !== values.next) return copy.noMatch;
    return undefined;
  };

  return (
    <ModalDialog
      open
      onOpenChange={(open) => (open ? null : onClose())}
      title={copy.changePasswordTitle}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            {copy.cancel}
          </Button>
          <Button type="submit" form={formId} disabled={!ready} busy={change.isPending}>
            {copy.changePassword}
          </Button>
        </>
      }
    >
      <form id={formId} className="flex flex-col gap-4" onSubmit={submit}>
        {field('current', copy.currentPassword, 'current-password', undefined, errorFor('current'))}
        {field('next', copy.newPassword, 'new-password', strength, errorFor('next'))}
        {field('confirm', copy.confirmPassword, 'new-password', undefined, errorFor('confirm'))}
        <label className="flex items-center gap-2 text-body text-ink-muted">
          <input type="checkbox" checked disabled readOnly className="size-4" />
          {copy.signOutOthers}
        </label>
        {error ? (
          <p role="alert" className="m-0 text-body-sm text-danger">
            {error}
          </p>
        ) : null}
        {/* Enter in the last field submits (US-ACCT-06). */}
        <button type="submit" hidden aria-hidden tabIndex={-1} />
      </form>
    </ModalDialog>
  );
}
