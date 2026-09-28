// ChangePassword (US-ACCT-06): current, new (with a length hint) and confirm; other devices are always signed out
// (07 §7.3), so that box is checked and can't be changed. Field-by-field errors are US-ACCT-07.
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
  const ready = values.current !== '' && passwordIssue(values.next) === null && values.confirm === values.next;

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
    onError: (err) => setError(err instanceof TRPCClientError && err.data ? copy.changeFailed : copy.unreachable),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!ready || change.isPending) return;
    setError(null);
    change.mutate();
  };

  const field = (name: Field, label: string, autoComplete: string, hint?: string) => (
    <TextField
      label={label}
      type={shown[name] ? 'text' : 'password'}
      autoComplete={autoComplete}
      value={values[name]}
      hint={hint}
      onChange={(e) => setValues((v) => ({ ...v, [name]: e.target.value }))}
      trailing={<PasswordReveal shown={shown[name]} onToggle={() => setShown((s) => ({ ...s, [name]: !s[name] }))} />}
    />
  );
  const strength =
    values.next === '' ? undefined : [...values.next].length >= PASSWORD_MIN_LENGTH ? copy.strong : copy.tooShort;

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
        {field('current', copy.currentPassword, 'current-password')}
        {field('next', copy.newPassword, 'new-password', strength)}
        {field('confirm', copy.confirmPassword, 'new-password')}
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
