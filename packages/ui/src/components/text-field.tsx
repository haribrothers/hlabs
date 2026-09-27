import { useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: ReactNode;
  hint?: ReactNode;
  /** Replaces the hint and turns the outline danger. Say what to do next. */
  error?: ReactNode;
}

/** A labelled input with a hint or an error below it. */
export function TextField({ label, hint, error, className, id, ...rest }: TextFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const messageId = `${inputId}-msg`;
  const message = error ?? hint;
  return (
    <div className={cn('hl-field', error ? 'hl-field-error' : null, className)}>
      <label className="hl-field-label" htmlFor={inputId}>
        {label}
      </label>
      <input
        id={inputId}
        className="hl-input"
        aria-invalid={error ? true : undefined}
        aria-describedby={message ? messageId : undefined}
        {...rest}
      />
      {message ? (
        <span id={messageId} className="hl-field-msg" role={error ? 'alert' : undefined}>
          {message}
        </span>
      ) : null}
    </div>
  );
}
