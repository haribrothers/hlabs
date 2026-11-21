import { useId, type InputHTMLAttributes, type ReactNode, type Ref } from 'react';
import { cn } from '../lib/cn';

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: ReactNode;
  hint?: ReactNode;
  /** Replaces the hint and turns the outline danger. Say what to do next. */
  error?: ReactNode;
  /** A small control inside the input's right edge, such as a show/hide password button. */
  trailing?: ReactNode;
  /**
   * Text that follows what's typed and can't be edited, such as a file's ".pdf" while renaming it (FilesRename).
   * Needs a controlled `value`.
   */
  suffix?: ReactNode;
  ref?: Ref<HTMLInputElement>;
  /** How an error is announced: 'assertive' (role="alert", default) or 'polite' (after what's being read). */
  announce?: 'assertive' | 'polite';
}

/** A labelled input with a hint or an error below it. */
export function TextField({
  label,
  hint,
  error,
  trailing,
  suffix,
  announce = 'assertive',
  className,
  id,
  ...rest
}: TextFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const messageId = `${inputId}-msg`;
  const message = error ?? hint;
  const input = suffix ? (
    // The input grows with its text (an invisible copy sets the width), so the suffix sits right after the name.
    <div
      className="hl-input hl-input-suffixed"
      onMouseDown={(e) => {
        if (e.target instanceof HTMLInputElement) return;
        e.preventDefault();
        document.getElementById(inputId)?.focus();
      }}
    >
      <span className="hl-input-grow" data-value={String(rest.value ?? '')}>
        <input
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={message ? messageId : undefined}
          size={1}
          {...rest}
        />
      </span>
      <span className="hl-input-suffix" aria-hidden="true">
        {suffix}
      </span>
    </div>
  ) : (
    <input
      id={inputId}
      className="hl-input"
      aria-invalid={error ? true : undefined}
      aria-describedby={message ? messageId : undefined}
      {...rest}
    />
  );
  return (
    <div className={cn('hl-field', error ? 'hl-field-error' : null, className)}>
      <label className="hl-field-label" htmlFor={inputId}>
        {label}
      </label>
      {trailing ? (
        <div className="hl-input-wrap">
          {input}
          <span className="hl-input-trailing">{trailing}</span>
        </div>
      ) : (
        input
      )}
      {message ? (
        <span
          id={messageId}
          className="hl-field-msg"
          role={error && announce === 'assertive' ? 'alert' : undefined}
          aria-live={error && announce === 'polite' ? 'polite' : undefined}
        >
          {message}
        </span>
      ) : null}
    </div>
  );
}
