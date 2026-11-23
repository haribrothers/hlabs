// Bits of a Settings row on a phone (D-172, US-PHONE-28): the 30px icon square at the start, the value in the faint
// colour and the chevron at the end. Rows stay the design system's ListRow; these only change what's in them.
import { ChevronRight, iconDefaults, type LucideIcon } from '@hlabs/icons';
import type { ReactNode } from 'react';

/** The icon square at the start of a row; `tone` gives it an area's Dock colour. */
export function RowIcon({ icon: Icon, tone }: { icon: LucideIcon; tone?: 'backups' | 'usage' | 'store' | 'files' }) {
  return (
    <span aria-hidden className="hl-p-sq" data-tone={tone}>
      <Icon {...iconDefaults} />
    </span>
  );
}

/** A value and/or a chevron at the end of a row ("80 · 8443 ›"). */
export function RowEnd({ value, chevron = false }: { value?: ReactNode; chevron?: boolean }) {
  return (
    <span className="flex shrink-0 items-center gap-2">
      {value !== undefined && value !== null ? <span className="hl-p-row-value text-row">{value}</span> : null}
      {chevron ? (
        <span aria-hidden className="hl-p-chev">
          <ChevronRight {...iconDefaults} />
        </span>
      ) : null}
    </span>
  );
}
