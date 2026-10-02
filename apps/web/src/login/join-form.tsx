// The AcceptInvite form (US-AUTH-24): name, username and password make the account, then this browser is signed in as
// it and goes Home. In preview (US-ACCT-23) the fields are disabled and nothing can be sent.
import { passwordIssue, USERNAME_PATTERN } from '@hlabs/shared';
import { Button, TextField } from '@hlabs/ui';
import { useMutation } from '@tanstack/react-query';
import { useId, useState, type FormEvent } from 'react';
import { inviteCopy as copy } from '../copy/invite';
import { errorCode, errorData } from '../lib/error-copy';
import { useTRPCClient } from '../lib/trpc';
import { useFinishLogin } from './use-login';

type Field = 'name' | 'username' | 'password';
type Errors = Partial<Record<Field, string>>;

/** What to fix, by the rules the daemon applies (the username is lowercased as it's typed). */
export function joinErrors(values: { name: string; username: string; password: string }): Errors {
  const errors: Errors = {};
  if (!values.name.trim()) errors.name = copy.nameRequired;
  if (!USERNAME_PATTERN.test(values.username)) errors.username = copy.usernameInvalid;
  const issue = passwordIssue(values.password);
  if (issue === 'tooShort') errors.password = copy.passwordTooShort;
  else if (issue === 'tooCommon') errors.password = copy.passwordTooCommon;
  return errors;
}

export function JoinForm({
  token,
  initialName,
  preview = false,
  onInvalid,
}: {
  token: string;
  initialName: string | null;
  preview?: boolean;
  /** The link stopped working while the form was open (used by someone else, revoked, expired). */
  onInvalid: () => void;
}) {
  const client = useTRPCClient();
  const finish = useFinishLogin();
  const formId = useId();
  const [name, setName] = useState(initialName ?? '');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [shown, setShown] = useState<Errors>({});
  const [failure, setFailure] = useState<string | null>(null);

  const join = useMutation({
    mutationFn: () => client.invites.accept.mutate({ token, displayName: name.trim(), username, password }),
    meta: { inlineErrors: true },
    onSuccess: ({ redirectTo }) => finish(redirectTo),
    onError: (err) => {
      const code = errorCode(err);
      if (code === 'INVITE_INVALID') return onInvalid();
      if (code === 'USERNAME_TAKEN') return setShown({ username: copy.usernameTaken });
      if (code === 'USERNAME_INVALID') return setShown({ username: copy.usernameInvalid });
      if (code === 'PASSWORD_TOO_SHORT') return setShown({ password: copy.passwordTooShort });
      if (code === 'PASSWORD_TOO_COMMON') return setShown({ password: copy.passwordTooCommon });
      if (code === 'AUTH_LOCKED') {
        const until = (errorData(err)?.detail as { until?: number } | undefined)?.until ?? Date.now();
        return setFailure(copy.locked(Math.max(1, Math.ceil((until - Date.now()) / 60_000))));
      }
      setFailure(copy.joinFailed);
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (preview) return;
    setFailure(null);
    const errors = joinErrors({ name, username, password });
    setShown(errors);
    if (Object.keys(errors).length === 0) join.mutate();
  };

  return (
    <form id={formId} noValidate onSubmit={submit} className="flex flex-col gap-4">
      <TextField
        label={copy.yourName}
        placeholder={copy.yourNamePlaceholder}
        autoComplete="name"
        maxLength={40}
        disabled={preview}
        value={name}
        error={shown.name}
        onChange={(e) => setName(e.target.value)}
      />
      <TextField
        label={copy.username}
        placeholder={copy.usernamePlaceholder}
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={32}
        disabled={preview}
        value={username}
        error={shown.username}
        onChange={(e) => setUsername(e.target.value.toLowerCase())}
      />
      <TextField
        label={copy.password}
        type="password"
        placeholder={copy.passwordPlaceholder}
        autoComplete="new-password"
        disabled={preview}
        value={password}
        error={shown.password}
        onChange={(e) => setPassword(e.target.value)}
      />
      {failure ? (
        <p role="alert" className="m-0 text-body-sm">
          {failure}
        </p>
      ) : null}
      <Button type="submit" size="lg" className="mt-2 w-full" disabled={preview} busy={join.isPending}>
        {copy.join}
      </Button>
      <p className="m-0 text-center text-caption text-ink-muted">{copy.worksOnce}</p>
    </form>
  );
}
