// The admin account form (US-ONB-08): username suggestion and password strength, from the shared rules.
import { passwordIssue, USERNAME_PATTERN } from '@hlabs/shared';
import { onboardingCopy } from '../copy/onboarding';

const copy = onboardingCopy.account;

/** "Hari Prasad" → "hari": the first word, lowercased, accents and anything but a–z, 0–9 and dashes removed. */
export function suggestUsername(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? '';
  return first
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 32);
}

export type Strength = { level: 'empty' | 'weak' | 'common' | 'strong'; bars: number; text: string };

/** Four bars: one while too short, none when common, three from 12 characters and four from 16. */
export function passwordStrength(password: string): Strength {
  if (password.length === 0) return { level: 'empty', bars: 0, text: copy.passwordEmpty };
  const issue = passwordIssue(password);
  if (issue === 'tooShort') return { level: 'weak', bars: 1, text: copy.passwordWeak };
  if (issue === 'tooCommon') return { level: 'common', bars: 1, text: copy.passwordCommon };
  return { level: 'strong', bars: [...password].length >= 16 ? 4 : 3, text: copy.passwordStrong };
}

export interface AccountValues {
  name: string;
  username: string;
  password: string;
  confirm: string;
}

export type AccountField = keyof AccountValues;

/** Form order, for focusing the first field to fix (US-ONB-09). */
export const ACCOUNT_FIELDS: readonly AccountField[] = ['name', 'username', 'password', 'confirm'];

/** What to fix in each field, by the same rules the daemon applies (the username is lowercased first). */
export function accountErrors(values: AccountValues): Partial<Record<AccountField, string>> {
  const errors: Partial<Record<AccountField, string>> = {};
  if (!values.name.trim()) errors.name = copy.nameMissing;
  if (!USERNAME_PATTERN.test(values.username.trim().toLowerCase())) errors.username = copy.usernameInvalid;
  const issue = passwordIssue(values.password);
  if (issue === 'tooShort') errors.password = copy.passwordWeak;
  if (issue === 'tooCommon') errors.password = copy.passwordCommon;
  if (values.confirm !== values.password) errors.confirm = copy.confirmMismatch;
  return errors;
}

/** The field and message for a code the daemon refused the account with (US-ONB-09), or null. */
export function serverFieldError(code: string | undefined): { field: AccountField; message: string } | null {
  switch (code) {
    case 'USERNAME_INVALID':
      return { field: 'username', message: copy.usernameInvalid };
    case 'USERNAME_TAKEN':
      return { field: 'username', message: copy.usernameTaken };
    case 'PASSWORD_TOO_SHORT':
      return { field: 'password', message: copy.passwordWeak };
    case 'PASSWORD_TOO_COMMON':
      return { field: 'password', message: copy.passwordCommon };
    default:
      return null;
  }
}
