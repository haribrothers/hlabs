// PhoneLogin's pieces (US-PHONE-05, D-172; PhoneRedesignA_Login): the hlabs lockup over "Log in to hlabs", fields as
// rows of an inset grouped list (17px, so iOS doesn't zoom into them), "Remember this phone" as a row with its
// switch, the full-width "Log in" and the error under the fields.
import { iconDefaults, LoaderCircle, LogoLockup } from '@hlabs/icons';
import { Switch, tokens } from '@hlabs/ui';
import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { loginCopy } from '../copy/login';

/** The lockup's height on PhoneLogin (as tall as a 40px line). */
const LOCKUP = tokens.SPACE_10;

export function PhoneLoginTitle({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-4 pt-6 pb-2">
      <LogoLockup size={LOCKUP} title="hlabs" />
      <h1 className="m-0 text-center text-title-1 font-bold">{children}</h1>
    </div>
  );
}

/** A field as a row: its label read to screen readers, its placeholder seen, something at the right (show password). */
export const PhoneLoginField = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { label: string; trailing?: ReactNode; errorId?: string }
>(function PhoneLoginField({ label, trailing, errorId, ...input }, ref) {
  const id = useId();
  return (
    <div className="hl-p-row">
      <span className="hl-p-row-main">
        <label htmlFor={id} className="sr-only">
          {label}
        </label>
        <input
          ref={ref}
          id={id}
          className="hl-p-input"
          aria-invalid={errorId ? true : undefined}
          aria-describedby={errorId}
          {...input}
        />
        {trailing}
      </span>
    </div>
  );
});

/** "Remember this phone" as a row: the words, then the switch (off by default, on in the home-screen app). */
export function PhoneRememberRow({ checked, onChange }: { checked: boolean; onChange: (on: boolean) => void }) {
  const id = useId();
  return (
    <div className="hl-p-row">
      <span className="hl-p-row-main">
        <label htmlFor={id} className="hl-p-row-text">
          {loginCopy.rememberPhone}
        </label>
        <Switch id={id} aria-label={loginCopy.rememberPhone} checked={checked} onChange={onChange} />
      </span>
    </div>
  );
}

/** The error under the fields, read out when it changes. */
export function PhoneLoginError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} aria-live="polite" className="m-0 min-h-0 px-4 text-footnote text-danger empty:hidden">
      {children}
    </p>
  );
}

/** The full-width "Log in", with a spinner while it's checking (US-PHONE-05). */
export function PhoneLogInButton({ disabled, busy }: { disabled: boolean; busy: boolean }) {
  return (
    <button type="submit" className="hl-p-primary hl-focus" disabled={disabled || busy} aria-busy={busy || undefined}>
      {busy ? <LoaderCircle aria-hidden className="hl-spin" {...iconDefaults} /> : null}
      {loginCopy.logIn}
    </button>
  );
}
