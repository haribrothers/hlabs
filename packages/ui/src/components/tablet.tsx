// Pieces of the touch layout on an iPad (D-175, styles/tablet.css).
import { ChevronLeft, iconDefaults } from '@hlabs/icons';

/**
 * "‹ Settings" (or "‹ Files") above a page you went into from a list, on an iPad in portrait
 * (TabletSettingsPortraitPage, US-TAB-05).
 */
export function TabletBack({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <button type="button" className="hl-t-back hl-focus" onClick={onBack}>
      <ChevronLeft aria-hidden {...iconDefaults} />
      {label}
    </button>
  );
}
