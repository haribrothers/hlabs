// The password rule (07 §7.2): at least 12 characters and not one of the most common passwords. Shared by the
// daemon (which enforces it) and the dashboard (which shows it as you type).
import { COMMON_PASSWORDS_12_PLUS } from './common-passwords';

export const PASSWORD_MIN_LENGTH = 12;

const common = new Set(COMMON_PASSWORDS_12_PLUS);

export type PasswordIssue = 'tooShort' | 'tooCommon';

/** Why a new password isn't allowed, or null when it is. */
export function passwordIssue(password: string): PasswordIssue | null {
  if ([...password].length < PASSWORD_MIN_LENGTH) return 'tooShort';
  if (common.has(password.toLowerCase())) return 'tooCommon';
  return null;
}
