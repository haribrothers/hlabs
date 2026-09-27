import { useEffect, useRef, type ClipboardEvent, type KeyboardEvent } from 'react';
import { cn } from '../lib/cn';
import { useUiStrings } from '../lib/strings';

export interface CodeInputProps {
  /** The digits entered so far (at most `length`). */
  value: string;
  onChange: (value: string) => void;
  /** Called once every digit is filled, with the full code. */
  onComplete?: (code: string) => void;
  length?: number;
  /** Names the group: "6-digit code". */
  label: string;
  disabled?: boolean;
  invalid?: boolean;
  /** Change it to move focus to the first digit (after a wrong code). */
  focusKey?: number;
  className?: string;
}

/**
 * One box per digit: digits only, typing moves to the next box, Backspace goes back, arrows move, and pasting
 * fills every box. The first box offers one-time-code autofill.
 */
export function CodeInput({
  value,
  onChange,
  onComplete,
  length = 6,
  label,
  disabled,
  invalid,
  focusKey,
  className,
}: CodeInputProps) {
  const t = useUiStrings();
  const boxes = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? '');

  useEffect(() => {
    if (focusKey !== undefined) boxes.current[0]?.focus();
  }, [focusKey]);

  const set = (next: string, focus: number) => {
    const code = next.slice(0, length);
    onChange(code);
    boxes.current[Math.min(focus, length - 1)]?.focus();
    if (code.length === length && /^\d+$/.test(code)) onComplete?.(code);
  };

  const type = (i: number, raw: string) => {
    const digit = raw.replace(/\D/g, '').slice(-1);
    if (!digit) return;
    // Filling a box further along than the digits so far appends; editing an earlier one replaces it.
    const next = i >= value.length ? value + digit : value.slice(0, i) + digit + value.slice(i + 1);
    set(next, i + 1);
  };

  const key = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      const at = digits[i] ? i : i - 1;
      if (at < 0) return;
      set(value.slice(0, at), at);
    } else if (e.key === 'ArrowLeft' && i > 0) {
      e.preventDefault();
      boxes.current[i - 1]?.focus();
    } else if (e.key === 'ArrowRight' && i < length - 1) {
      e.preventDefault();
      boxes.current[i + 1]?.focus();
    }
  };

  const paste = (e: ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (!pasted) return;
    e.preventDefault();
    set(pasted, pasted.length);
  };

  return (
    <div role="group" aria-label={label} className={cn('hl-code', className)}>
      {digits.map((digit, i) => (
        <input
          key={i}
          ref={(el) => {
            boxes.current[i] = el;
          }}
          className={cn('hl-input hl-code-digit', invalid && 'hl-code-invalid')}
          aria-label={t.digit(i + 1)}
          aria-invalid={invalid || undefined}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          pattern="[0-9]*"
          maxLength={length}
          value={digit}
          disabled={disabled}
          onChange={(e) => type(i, e.target.value)}
          onKeyDown={(e) => key(i, e)}
          onPaste={paste}
          onFocus={(e) => e.target.select()}
        />
      ))}
    </div>
  );
}
