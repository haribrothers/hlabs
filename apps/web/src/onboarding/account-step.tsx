// OnbAccount (US-ONB-08): create the admin account and sign in, then two-factor.
import { Eye, EyeOff, iconDefaults } from '@hlabs/icons';
import { Button, TextField } from '@hlabs/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { onboardingCopy } from '../copy/onboarding';
import { setCsrfToken } from '../lib/csrf';
import { useTRPC, useTRPCClient } from '../lib/trpc';
import { passwordStrength, suggestUsername } from './account-form';
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

export function AccountStep() {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [usernameEdited, setUsernameEdited] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const strength = passwordStrength(password);

  const create = useMutation(
    trpc.onboarding.createAdmin.mutationOptions({
      onSuccess: async () => {
        // Signed in now: later onboarding calls use this session and its CSRF token.
        const me = await client.auth.me.query();
        setCsrfToken(me.csrfToken);
        await queryClient.invalidateQueries({ queryKey: trpc.onboarding.status.queryKey() });
        await navigate({ to: '/setup/$step', params: { step: 'twoFactor' } });
      },
    }),
  );

  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate({ displayName: name, username, password });
  };

  return (
    <StepFrame step="account" title={onboardingCopy.titles.account}>
      <p className="m-0 mt-2 text-body text-ink-muted">{copy.lead}</p>
      <form className="mt-6 flex flex-col gap-4" onSubmit={submit} noValidate>
        <TextField
          label={copy.name}
          autoComplete="name"
          value={name}
          maxLength={40}
          onChange={(e) => {
            setName(e.target.value);
            if (!usernameEdited) setUsername(suggestUsername(e.target.value));
          }}
        />
        <TextField
          label={copy.username}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          value={username}
          maxLength={32}
          onChange={(e) => {
            setUsernameEdited(true);
            setUsername(e.target.value);
          }}
        />
        <TextField
          label={copy.password}
          type={showPassword ? 'text' : 'password'}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          trailing={<Reveal shown={showPassword} onToggle={() => setShowPassword(!showPassword)} />}
          hint={
            <span className="flex flex-col gap-1">
              {password ? <StrengthMeter bars={strength.bars} level={strength.level} /> : null}
              <span>{strength.text}</span>
            </span>
          }
        />
        <TextField
          label={copy.confirm}
          type={showConfirm ? 'text' : 'password'}
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          trailing={<Reveal shown={showConfirm} onToggle={() => setShowConfirm(!showConfirm)} />}
        />
        {create.isError ? (
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
