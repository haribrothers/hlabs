// LoginPublic (US-SYS-46; D-182, 07 §7.11 control 3): the sign-in on the dashboard's public address. A username and
// password typed, never a list of who uses hlabs and no "Remember me"; two-factor is always asked next (Login2FA, as
// at home). Someone without two-factor gets "Turn on two-factor login first…" and no session; too many tries say how
// long to wait, inline. The page's foot says it's from the internet.
import { Lock, TriangleAlert, iconDefaults } from '@hlabs/icons';
import { Button, TextField, useIsPhone } from '@hlabs/ui';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { loginCopy } from '../copy/login';
import { publicDashboardCopy as copy } from '../copy/public-dashboard';
import { errorCode, errorData } from '../lib/error-copy';
import { OnboardingLogo } from '../onboarding/onboarding-layout';
import { PasswordReveal } from '../shell/password-reveal';
import { LoginLayout } from './login-layout';
import { PhoneLogInButton, PhoneLoginError, PhoneLoginField, PhoneLoginTitle } from './phone-login';
import { loginFailure, useLogin } from './use-login';

/** How long a lockout lasts when the daemon doesn't say (07 §7.2: 15 minutes). */
const LOCK_FALLBACK_S = 15 * 60;

type Locked = { until: number; minutes: number; address: boolean };

function lockedFrom(err: unknown, now = Date.now()): Locked {
  const detail = errorData(err)?.detail ?? {};
  const retry = typeof detail.retryAfterSeconds === 'number' ? detail.retryAfterSeconds : LOCK_FALLBACK_S;
  return { until: now + retry * 1000, minutes: Math.max(1, Math.ceil(retry / 60)), address: detail.address === true };
}

/** "Too many tries. Try again in 15 minutes.", or from this network for about an hour. */
function LockedLine({ locked }: { locked: Locked }) {
  return (
    <div
      role="alert"
      className="flex items-center gap-2.5 rounded-md border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-4 py-3 text-body-sm text-danger"
    >
      <Lock aria-hidden {...iconDefaults} size={18} className="shrink-0" />
      {locked.address ? copy.addressLockedLine : copy.lockedLine(locked.minutes)}
    </div>
  );
}

/** "Turn on two-factor login first. Signing in from the internet needs it…" (LoginPublic-no2fa). */
function NoTwoFactor() {
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-md border border-[color-mix(in_srgb,var(--warning)_35%,transparent)] bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] px-4 py-3 text-left text-body text-ink"
    >
      <TriangleAlert aria-hidden {...iconDefaults} size={18} className="mt-0.5 shrink-0 text-warning" />
      <p className="m-0">
        <strong>{copy.no2faStrong}</strong> {copy.no2faRest}
      </p>
    </div>
  );
}

export function PublicLoginView({ next }: { next?: string }) {
  const phone = useIsPhone();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [shown, setShown] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState<Locked | null>(null);
  const [no2fa, setNo2fa] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  const passwordField = useRef<HTMLInputElement>(null);
  const errorId = useId();
  // Never "Remember me" there: the session ends after 12 hours anyway (US-SYS-46).
  const login = useLogin(next);
  const busy = login.isPending;
  // Cleared once the wait is over (below).
  const stillLocked = locked !== null;
  const ready = username.trim() !== '' && password !== '' && !stillLocked;

  useEffect(() => {
    if (!no2fa) field.current?.focus();
  }, [no2fa]);
  // The form comes back once the wait is over.
  useEffect(() => {
    if (!locked) return;
    const timer = setTimeout(() => setLocked(null), Math.max(0, locked.until - Date.now()));
    return () => clearTimeout(timer);
  }, [locked]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!ready || busy) return;
    setError(null);
    login.mutate(
      { username, password, remember: false },
      {
        onError: (err) => {
          const code = errorCode(err);
          if (code === 'AUTH_TWO_FACTOR_REQUIRED') {
            setPassword('');
            setNo2fa(true);
            return;
          }
          const failure = loginFailure(err);
          if (failure === 'locked') setLocked(lockedFrom(err));
          else if (failure === 'credentials') {
            setPassword('');
            setError(loginCopy.wrongDetails);
            passwordField.current?.focus();
          } else setError(failure === 'unreachable' ? loginCopy.unreachable : loginCopy.failed);
        },
      },
    );
  };

  const back = () => {
    setNo2fa(false);
    setError(null);
  };

  if (phone)
    return (
      <LoginLayout>
        <PhoneLoginTitle>{copy.signInTitle}</PhoneLoginTitle>
        {no2fa ? (
          <div className="flex flex-col gap-5">
            <NoTwoFactor />
            <button type="button" className="hl-p-secondary hl-focus" onClick={back}>
              {copy.back}
            </button>
          </div>
        ) : (
          <form className="flex flex-col gap-5" onSubmit={submit}>
            {stillLocked ? <LockedLine locked={locked} /> : null}
            <div className="flex flex-col gap-1.5">
              <div className="hl-p-group">
                <PhoneLoginField
                  ref={field}
                  label={loginCopy.username}
                  placeholder={loginCopy.username}
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  enterKeyHint="next"
                  spellCheck={false}
                  readOnly={busy}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
                <PhoneLoginField
                  ref={passwordField}
                  label={loginCopy.password}
                  placeholder={loginCopy.password}
                  type={shown ? 'text' : 'password'}
                  autoComplete="current-password"
                  enterKeyHint="go"
                  readOnly={busy}
                  value={password}
                  errorId={error ? errorId : undefined}
                  onChange={(e) => setPassword(e.target.value)}
                  trailing={<PasswordReveal shown={shown} onToggle={() => setShown((v) => !v)} />}
                />
              </div>
              <PhoneLoginError id={errorId}>{error}</PhoneLoginError>
              <p className="m-0 px-4 text-footnote text-ink-muted">{copy.twoFactorNeeded}</p>
            </div>
            <PhoneLogInButton disabled={!ready} busy={busy} label={copy.continue} />
            <p className="m-0 text-center text-footnote text-ink-muted">{copy.forgotPublic}</p>
          </form>
        )}
      </LoginLayout>
    );

  return (
    <LoginLayout>
      <OnboardingLogo />
      <h1 className="m-0 text-display">{copy.signInTitle}</h1>
      {no2fa ? (
        <div className="mt-4 flex w-full max-w-sm flex-col gap-4">
          <NoTwoFactor />
          <Button variant="secondary" size="lg" onClick={back}>
            {copy.back}
          </Button>
        </div>
      ) : (
        <form className="mt-4 flex w-full max-w-sm flex-col gap-4 text-left" onSubmit={submit}>
          {stillLocked ? <LockedLine locked={locked} /> : null}
          <TextField
            ref={field}
            label={loginCopy.username}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            enterKeyHint="next"
            spellCheck={false}
            readOnly={busy}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <TextField
            ref={passwordField}
            label={loginCopy.password}
            error={error ?? undefined}
            hint={copy.twoFactorNeeded}
            announce="polite"
            type={shown ? 'text' : 'password'}
            autoComplete="current-password"
            enterKeyHint="go"
            trailing={<PasswordReveal shown={shown} onToggle={() => setShown((v) => !v)} />}
            readOnly={busy}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button type="submit" size="lg" disabled={!ready} busy={busy}>
            {copy.continue}
          </Button>
          <p className="m-0 text-center text-body-sm text-ink-muted">{copy.forgotPublic}</p>
        </form>
      )}
    </LoginLayout>
  );
}
