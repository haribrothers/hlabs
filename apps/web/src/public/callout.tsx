// A tinted note inside the public-access dialogs (PublicSetup, AppPublic, Visits): an icon and words, the tint from a
// token so it reads in the glass and solid themes.
import type { ReactNode } from 'react';

const TONES = {
  info: 'border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[color-mix(in_srgb,var(--accent)_14%,transparent)]',
  warning:
    'border-[color-mix(in_srgb,var(--warning)_35%,transparent)] bg-[color-mix(in_srgb,var(--warning)_10%,transparent)]',
  danger:
    'border-[color-mix(in_srgb,var(--danger)_40%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]',
} as const;

export function Callout({
  tone = 'info',
  icon,
  children,
  role,
}: {
  tone?: keyof typeof TONES;
  icon?: ReactNode;
  children: ReactNode;
  role?: 'status' | 'alert';
}) {
  return (
    <div
      role={role}
      className={`flex items-start gap-2.5 rounded-md border px-3.5 py-3 text-body-sm text-ink ${TONES[tone]}`}
    >
      {icon ? <span className="mt-0.5 flex shrink-0">{icon}</span> : null}
      <div className="flex min-w-0 flex-1 flex-col gap-2">{children}</div>
    </div>
  );
}
