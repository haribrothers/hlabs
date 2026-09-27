// The admin account form (US-ONB-08): username suggestion and password strength, from the shared rules.
import { passwordIssue } from '@hlabs/shared';
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
