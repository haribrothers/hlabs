import { cn } from '../lib/cn';

/** The four accent colours double as avatar colours (D-023). */
export const AVATAR_COLORS = ['violet', 'mint', 'amber', 'rose'] as const;
export type AvatarColor = (typeof AVATAR_COLORS)[number];

/** The stored colour when it's one of the four, otherwise one picked from the username so it never changes. */
export function avatarColorFor(username: string, stored?: string | null): AvatarColor {
  if (stored && (AVATAR_COLORS as readonly string[]).includes(stored)) return stored as AvatarColor;
  let hash = 0;
  for (const ch of username) hash = (hash * 31 + ch.codePointAt(0)!) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]!;
}

export interface AvatarProps {
  /** Display name: its first letter is shown. */
  name: string;
  color: AvatarColor;
  size?: 'md' | 'xl' | 'lg';
  className?: string;
}

/** A person's initial on their colour. Decorative: always pair it with their name in text. */
export function Avatar({ name, color, size = 'lg', className }: AvatarProps) {
  const initial = [...name.trim()][0]?.toLocaleUpperCase() ?? '?';
  return (
    <span data-accent={color} aria-hidden="true" className={cn('hl-avatar', `hl-avatar-${size}`, className)}>
      {initial}
    </span>
  );
}
