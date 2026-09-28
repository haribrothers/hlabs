// The show/hide button inside a password field (onboarding, change password).
import { Eye, EyeOff, iconDefaults } from '@hlabs/icons';
import { shellCopy } from '../copy/shell';

export function PasswordReveal({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  const Icon = shown ? EyeOff : Eye;
  return (
    <button
      type="button"
      className="grid size-8 place-items-center rounded-xs text-ink-muted hover:text-ink"
      aria-label={shown ? shellCopy.hidePassword : shellCopy.showPassword}
      aria-pressed={shown}
      onClick={onToggle}
    >
      <Icon aria-hidden {...iconDefaults} />
    </button>
  );
}
