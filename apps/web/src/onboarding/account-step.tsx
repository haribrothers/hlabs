// OnbAccount (US-ONB-08, US-ONB-09): create the admin account and sign in, then two-factor. Errors show when
// a field loses focus or on submit, clear as soon as the field is fixed, and are counted in a summary.
import { CircleAlert, Eye, EyeOff, iconDefaults } from '@hlabs/icons';
import { Button, TextField } from '@hlabs/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { TRPCClientError } from '@trpc/client';
import { useState, type FormEvent } from 'react';
import { onboardingCopy } from '../copy/onboarding';
import { setCsrfToken } from '../lib/csrf';
import { useTRPC, useTRPCClient } from '../lib/trpc';
import {
  ACCOUNT_FIELDS,
  accountErrors,
  passwordStrength,
  serverFieldError,
  suggestUsername,
  type AccountField,
  type AccountValues,
} from './account-form';
import { StepFrame } from './step-frame';

const copy = onboardingCopy.account;

function Reveal({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  const Icon = shown ? EyeOff : Eye;
  return (
    <button
      type="button"
      className="grid size-8 place-items-center rounded-xs text-ink-muted hover:text-ink"
      aria-label={shown ? copy.hide : copy.show}
      aria-pressed={shown}
      onClick={onToggle}
    >
      <Icon aria-hidden {...iconDefaults} />
    </button>
  );
}

function StrengthMeter({ bars, level }: { bars: number; level: string }) {
  return (
    <span className="flex gap-1" role="img" aria-label={`${copy.strength}: ${level}`}>
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className={`h-1 flex-1 rounded-pill ${i < bars ? (level === 'strong' ? 'bg-success' : 'bg-danger') : 'bg-hairline'}`}
        />
      ))}
    </span>
  );
}

const fieldId = (field: AccountField) => `account-${field}`;
const focusField = (field: AccountField) => document.getElementById(fieldId(field))?.focus();

const hlabsCode = (err: unknown) =>
  err instanceof TRPCClientError ? (err.data as { hlabsCode?: string } | undefined)?.hlabsCode : undefined;

export function AccountStep() {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [values, setValues] = useState<AccountValues>({ name: '', username: '', password: '', confirm: '' });
  const [usernameEdited, setUsernameEdited] = useState(false);
  const [shown, setShown] = useState({ password: false, confirm: false });
  const [touched, setTouched] = useState<Partial<Record<AccountField, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  /** Errors the daemon returned, kept until that field changes. */
  const [serverErrors, setServerErrors] = useState<Partial<Record<AccountField, string>>>({});

  const errors = { ...accountErrors(values), ...serverErrors };
  const visible = (field: AccountField) => (touched[field] || submitted ? errors[field] : undefined);
  const count = ACCOUNT_FIELDS.filter((f) => errors[f]).length;
  const strength = passwordStrength(values.password);

  const create = useMutation(
    trpc.onboarding.createAdmin.mutationOptions({
      onSuccess: async () => {
        // Signed in now: later onboarding calls use this session and its CSRF token.
        const me = await client.auth.me.query();
        setCsrfToken(me.csrfToken);
        await queryClient.invalidateQueries({ queryKey: trpc.onboarding.status.queryKey() });
        await navigate({ to: '/setup/$step', params: { step: 'twoFactor' } });
      },
      onError: (err) => {
        const mapped = serverFieldError(hlabsCode(err));
        if (!mapped) return;
        setServerErrors({ [mapped.field]: mapped.message });
        focusField(mapped.field);
      },
    }),
  );

  const change = (field: AccountField, value: string) => {
    setValues((v) => {
      const next = { ...v, [field]: value };
      if (field === 'name' && !usernameEdited) next.username = suggestUsername(value);
      return next;
    });
    if (field === 'username') setUsernameEdited(true);
    setServerErrors(({ [field]: _cleared, ...rest }) => rest);
  };

  const field = (name: AccountField) => ({
    id: fieldId(name),
    value: values[name],
    onChange: (e: { target: { value: string } }) => change(name, e.target.value),
    onBlur: () => setTouched((t) => ({ ...t, [name]: true })),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    const first = ACCOUNT_FIELDS.find((f) => errors[f]);
    if (first) {
      focusField(first);
      return;
    }
    create.mutate({ displayName: values.name, username: values.username, password: values.password });
  };

  const passwordError = visible('password');
  const passwordMessage = (
    <span className="flex flex-col gap-1">
      {values.password ? <StrengthMeter bars={strength.bars} level={strength.level} /> : null}
      <span>{passwordError ?? strength.text}</span>
    </span>
  );
  const otherFailure = create.isError && !serverFieldError(hlabsCode(create.error));

  return (
    <StepFrame step="account" title={onboardingCopy.titles.account}>
      <p className="m-0 mt-2 text-body text-ink-muted">{copy.lead}</p>
      <form className="mt-6 flex flex-col gap-4" onSubmit={submit} noValidate>
        {submitted && count > 0 ? (
          <p
            role="alert"
            className="m-0 flex items-center gap-2 rounded-sm border border-danger/50 bg-danger-fill/20 px-4 py-3 text-body-sm"
          >
            <CircleAlert aria-hidden {...iconDefaults} />
            {copy.fixCount(count)}
          </p>
        ) : null}
        <TextField label={copy.name} autoComplete="name" maxLength={40} error={visible('name')} {...field('name')} />
        <TextField
          label={copy.username}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={32}
          error={visible('username')}
          {...field('username')}
        />
        <TextField
          label={copy.password}
          type={shown.password ? 'text' : 'password'}
          autoComplete="new-password"
          trailing={
            <Reveal shown={shown.password} onToggle={() => setShown((s) => ({ ...s, password: !s.password }))} />
          }
          {...(passwordError ? { error: passwordMessage } : { hint: passwordMessage })}
          {...field('password')}
        />
        <TextField
          label={copy.confirm}
          type={shown.confirm ? 'text' : 'password'}
          autoComplete="new-password"
          trailing={<Reveal shown={shown.confirm} onToggle={() => setShown((s) => ({ ...s, confirm: !s.confirm }))} />}
          error={visible('confirm')}
          {...field('confirm')}
        />
        {otherFailure ? (
          <p role="alert" className="m-0 text-body-sm">
            {copy.failed}
          </p>
        ) : null}
        <div className="mt-4 flex items-center justify-between gap-4">
          <Button variant="link" onClick={() => void navigate({ to: '/setup/$step', params: { step: 'system' } })}>
            {onboardingCopy.back}
          </Button>
          <Button type="submit" size="lg" disabled={create.isPending} aria-busy={create.isPending}>
            {copy.create}
          </Button>
        </div>
      </form>
    </StepFrame>
  );
}
