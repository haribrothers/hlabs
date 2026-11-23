// The one-time "Add hlabs to your Home Screen" card on PhoneHome (US-PHONE-23, D-030; PhoneRedesignA_AddToHomeScreen):
// iOS Safari only, not in the home-screen app, until it's dismissed. The dismissal is kept in this browser's
// localStorage; where storage isn't available it's kept for this visit only, so the card comes back at most once a
// visit.
import { iconDefaults, LOGO_SCALE, LogoMark, Share } from '@hlabs/icons';
import { isFeatureEnabled, VISIBLE_PHASE } from '@hlabs/shared';
import { tokens } from '@hlabs/ui';
import { useState } from 'react';
import { homeCopy } from '../copy/home';
import { isIosSafari, isStandalone } from '../lib/install-app';

export const IOS_HINT_KEY = 'hlabs.iosHintDismissed';
let dismissedThisVisit = false;

function dismissedBefore(): boolean {
  if (dismissedThisVisit) return true;
  try {
    return window.localStorage.getItem(IOS_HINT_KEY) === '1';
  } catch {
    return false;
  }
}

/** Tests: a new visit. */
export const resetIosHint = () => {
  dismissedThisVisit = false;
};

/** The hlabs app icon beside the hint: as tall as the hint's first two lines (48px, the mark inset as logos are). */
const ICON = tokens.SIZE_CONTROL + tokens.SPACE_1;

export function IosInstallHint({ shippedPhase = VISIBLE_PHASE }: { shippedPhase?: number }) {
  const [hidden, setHidden] = useState(
    () => !isFeatureEnabled('pwa', shippedPhase) || !isIosSafari() || isStandalone() || dismissedBefore(),
  );
  if (hidden) return null;
  const dismiss = () => {
    dismissedThisVisit = true;
    try {
      window.localStorage.setItem(IOS_HINT_KEY, '1');
    } catch {
      // Private browsing or blocked storage: this visit only.
    }
    setHidden(true);
  };
  return (
    <div
      role="note"
      aria-label={homeCopy.iosHint}
      className="hl-glass hl-glass-1 flex w-full items-start gap-3 rounded-xl border border-border-glass p-4"
    >
      <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-sm bg-(image:--dock-home)">
        <LogoMark size={Math.round(ICON * LOGO_SCALE)} title="" tone="white" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="m-0 text-row font-semibold">{homeCopy.iosHintTitle}</p>
        <p className="m-0 text-subhead text-ink-muted">
          {homeCopy.iosHintBodyStart}
          <Share aria-hidden {...iconDefaults} className="mx-0.5 inline size-4 align-[-2px]" />
          {homeCopy.iosHintBodyEnd}
        </p>
        <button type="button" className="hl-p-link hl-focus self-start font-semibold" onClick={dismiss}>
          {homeCopy.iosHintDismiss}
        </button>
      </div>
    </div>
  );
}
