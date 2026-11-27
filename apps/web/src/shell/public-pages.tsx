// hlabs's pages on a public app's address (US-APP-27, US-APP-28; D-178), as the PublicSignIn screen draws them: one
// centred column in the phone's Direction A style (D-172), the app's tile, and a footer naming the address. They read
// their data from the JSON the daemon adds and post plain forms back to `/.hlabs/sign-in` and `/.hlabs/sign-out`
// (the CSP allows nothing else): no requests of their own. The address shows only the app's own tile (its gradient
// and initial): its logo is served on home addresses only.
import { flushSync } from 'react-dom';
import { AppLogo, CircleAlert, gradientFor, iconDefaults, Lock, TriangleAlert } from '@hlabs/icons';
import { CodeInput, tokens } from '@hlabs/ui';
import { useEffect, useId, useRef, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { publicPageCopy as copy } from '../copy/public-pages';

/** The app's tile on a public address. */
export interface PublicAppIcon {
  gradient: [string, string] | null;
  fallback: string | null;
}

/** `/.hlabs/sign-in` (apps/daemon/src/http/static-page.ts `PublicSignInPage`). */
export interface PublicSignInData {
  kind: 'publicSignIn';
  step: 'password' | 'code' | 'no2fa' | 'tooManyTries';
  appName: string;
  icon: PublicAppIcon;
  host: string;
  next: string;
  username: string | null;
  challenge: string | null;
  error: 'invalid' | 'expired' | 'locked' | null;
  retryAfterSeconds: number | null;
}

export interface PublicSignOutData {
  kind: 'publicSignOut';
  appName: string;
  icon: PublicAppIcon;
  host: string;
}

export interface AppNotRunningData {
  kind: 'appNotRunning';
  appName: string;
  icon: PublicAppIcon;
  host: string;
}

const SIGN_IN = '/.hlabs/sign-in';
const SIGN_OUT = '/.hlabs/sign-out';
const LOGO = tokens.SIZE_APP_ICON;
const CODE_LENGTH = 6;

function AppTile({ name, icon }: { name: string; icon: PublicAppIcon }) {
  // The app's gradient and its initial: the Lucide glyph would load its icon as a separate script, and these pages
  // are one inlined file that may load nothing else (CSP).
  return (
    <AppLogo
      decorative
      name={name}
      colors={icon.gradient ?? gradientFor(name)}
      fallbackIcon={
        <span aria-hidden className="text-title-1">
          {name.charAt(0).toUpperCase()}
        </span>
      }
      size={LOGO}
      radius={tokens.RADIUS_ICON}
      className="shadow-icon"
    />
  );
}

/** The page's frame: the tile, the title and its lead, the body, and "Protected by hlabs · <address>" at the foot. */
export function PublicFrame({
  appName,
  icon,
  host,
  title,
  lead,
  children,
}: {
  appName: string;
  icon: PublicAppIcon;
  host: string;
  title: string;
  lead?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="hl-wall flex min-h-full flex-col">
      <main className="mx-auto flex w-full max-w-[400px] flex-1 flex-col px-4 pt-14 pb-6">
        <div className="flex flex-col items-center text-center">
          <AppTile name={appName} icon={icon} />
          <h1 className="m-0 mt-5 text-title-1">{title}</h1>
          {lead ? <p className="m-0 mt-2 text-headline font-normal text-ink-muted">{lead}</p> : null}
        </div>
        {children}
      </main>
      <footer className="flex items-center justify-center gap-1.5 px-4 pb-8 text-footnote text-ink-faint">
        <Lock aria-hidden {...iconDefaults} size={tokens.SPACE_3 + 2} />
        <span>
          {copy.protectedBy} · <span className="font-mono">{host}</span>
        </span>
      </footer>
    </div>
  );
}

/** A red or amber note: what went wrong, or what to do first. */
function Note({ tone, children }: { tone: 'danger' | 'warning'; children: ReactNode }) {
  const Icon = tone === 'danger' ? CircleAlert : TriangleAlert;
  return (
    <div
      role="alert"
      className={
        tone === 'danger'
          ? 'mt-5 flex items-start gap-2.5 rounded-sm bg-danger/10 px-3.5 py-3 text-subhead text-danger'
          : 'mt-6 flex items-start gap-2.5 rounded-sm bg-warning/10 p-3.5 text-subhead text-ink'
      }
    >
      <Icon
        aria-hidden
        {...iconDefaults}
        size={tokens.SPACE_5}
        className={tone === 'danger' ? 'shrink-0 text-danger' : 'shrink-0 text-warning'}
      />
      <span>{children}</span>
    </div>
  );
}

function Hidden({ name, value }: { name: string; value: string | null }) {
  return <input type="hidden" name={name} value={value ?? ''} />;
}

/** A field as a row of the grouped list, its label for screen readers and its placeholder seen. */
function Field({
  label,
  ...input
}: { label: string } & Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'id'>) {
  const id = useId();
  return (
    <div className="hl-p-row">
      <span className="hl-p-row-main">
        <label htmlFor={id} className="sr-only">
          {label}
        </label>
        <input id={id} className="hl-p-input" placeholder={label} {...input} />
      </span>
    </div>
  );
}

function errorLine(data: PublicSignInData): string | null {
  if (data.error === 'invalid') return data.step === 'code' ? copy.wrongCode : copy.wrongPassword;
  if (data.error === 'expired') return copy.expired;
  if (data.error === 'locked') return copy.locked(data.retryAfterSeconds);
  return null;
}

function PasswordStep({ data }: { data: PublicSignInData }) {
  const error = errorLine(data);
  return (
    <>
      {error ? <Note tone="danger">{error}</Note> : null}
      <form method="post" action={SIGN_IN} className="mt-6 flex flex-col">
        <Hidden name="next" value={data.next} />
        <div className="hl-p-group">
          <Field
            label={copy.username}
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            defaultValue={data.username ?? ''}
            autoFocus={!data.username}
          />
          <Field
            label={copy.password}
            name="password"
            type="password"
            autoComplete="current-password"
            required
            autoFocus={Boolean(data.username)}
          />
        </div>
        <p className="hl-p-foot">{copy.notYourAppAccount(data.appName)}</p>
        <button type="submit" className="hl-p-primary hl-focus mt-6">
          {copy.continue}
        </button>
        <p className="m-0 mt-3 text-center text-footnote text-ink-faint">{copy.forgot}</p>
      </form>
    </>
  );
}

function CodeStep({ data }: { data: PublicSignInData }) {
  const [recovery, setRecovery] = useState(false);
  const [code, setCode] = useState('');
  const form = useRef<HTMLFormElement>(null);
  const error = errorLine(data);
  return (
    <>
      {error ? <Note tone="danger">{error}</Note> : null}
      <form method="post" action={SIGN_IN} ref={form} className="mt-6 flex flex-col items-center">
        <Hidden name="next" value={data.next} />
        <Hidden name="challenge" value={data.challenge} />
        {recovery ? (
          <>
            <p className="m-0 text-center text-subhead text-ink-muted">{copy.recoveryPrompt}</p>
            <div className="hl-p-group mt-4 w-full">
              <Field
                label={copy.recoveryCode}
                name="recoveryCode"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                required
                autoFocus
              />
            </div>
          </>
        ) : (
          <>
            <p className="m-0 text-center text-subhead text-ink-muted">{copy.codePrompt}</p>
            <CodeInput
              className="mt-4"
              label={copy.code}
              length={CODE_LENGTH}
              value={code}
              onChange={setCode}
              invalid={data.error === 'invalid'}
              focusKey={0}
              onComplete={(full) => {
                // The hidden field must hold all six digits before the form goes: the last one is still being set.
                flushSync(() => setCode(full));
                form.current?.requestSubmit();
              }}
            />
            <Hidden name="code" value={code} />
          </>
        )}
        <button type="submit" className="hl-p-primary hl-focus mt-7" disabled={!recovery && code.length < CODE_LENGTH}>
          {copy.verify}
        </button>
        <button type="button" className="hl-p-link hl-focus" onClick={() => setRecovery((r) => !r)}>
          {recovery ? copy.useCode : copy.useRecoveryCode}
        </button>
      </form>
    </>
  );
}

export function PublicSignIn({ data }: { data: PublicSignInData }) {
  useEffect(() => {
    document.title = copy.signInDocTitle(data.appName);
  }, [data.appName]);
  return (
    <PublicFrame
      appName={data.appName}
      icon={data.icon}
      host={data.host}
      title={copy.signInTitle(data.appName)}
      lead={data.step === 'code' ? copy.codeLead : copy.lead(data.host)}
    >
      {data.step === 'password' ? <PasswordStep data={data} /> : null}
      {data.step === 'code' ? <CodeStep data={data} /> : null}
      {data.step === 'no2fa' ? (
        <>
          <Note tone="warning">
            <b>{copy.no2faTitle}</b> {copy.no2faBody(data.appName)}
          </Note>
          <a href={`${SIGN_IN}?next=${encodeURIComponent(data.next)}`} className="hl-p-secondary hl-focus mt-6">
            {copy.back}
          </a>
        </>
      ) : null}
      {data.step === 'tooManyTries' ? <Note tone="danger">{copy.tooManyTries(data.retryAfterSeconds)}</Note> : null}
    </PublicFrame>
  );
}

/** A form with one button posting to `/.hlabs/sign-out`. */
export function SignOutForm({ variant = 'primary' }: { variant?: 'primary' | 'secondary' }) {
  return (
    <form method="post" action={SIGN_OUT} className="flex w-full flex-col">
      <button type="submit" className={`hl-p-${variant} hl-focus`}>
        {copy.signOut}
      </button>
    </form>
  );
}

export function PublicSignOut({ data }: { data: PublicSignOutData }) {
  useEffect(() => {
    document.title = copy.signOutTitle(data.appName);
  }, [data.appName]);
  return (
    <PublicFrame
      appName={data.appName}
      icon={data.icon}
      host={data.host}
      title={copy.signOutTitle(data.appName)}
      lead={copy.signOutBody}
    >
      <div className="mt-6">
        <SignOutForm />
      </div>
    </PublicFrame>
  );
}

export function AppNotRunning({ data }: { data: AppNotRunningData }) {
  useEffect(() => {
    document.title = copy.notRunningTitle(data.appName);
  }, [data.appName]);
  return (
    <PublicFrame
      appName={data.appName}
      icon={data.icon}
      host={data.host}
      title={copy.notRunningTitle(data.appName)}
      lead={copy.notRunningBody}
    />
  );
}
