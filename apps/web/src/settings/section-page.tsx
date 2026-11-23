// One Settings section (US-ACCT-01): the section, "You don't have access to this" for a member at an admin-only URL
// (no redirect, no admin data asked for), or "Page not found". Opening a section moves focus to its heading.
import { PhoneHeader, ScrollPane } from '@hlabs/ui';
import { useNavigate, useRouter } from '@tanstack/react-router';
import { useEffect, useRef, type ComponentType } from 'react';
import { settingsCopy } from '../copy/settings';
import { useIsDesktop } from '../lib/use-media';
import { useMe } from '../lib/use-me';
import { AccessDenied } from '../shell/access-denied';
import { BackupsActions, BackupsSection } from '../backups/backups-section';
import { AccountSection } from './account-section';
import { EditProfileButton } from './profile';
import { AdvancedSection } from './advanced-section';
import { AppearanceSection } from './appearance-section';
import { EngineSection, EngineStatus } from './engine-section';
import { NetworkSection } from './network-section';
import { sectionAccess, type SectionId } from './sections';
import { StorageSection } from './storage-section';
import { UpdatesSection } from './updates-section';
import { InviteButton, UsersSection } from './users-section';

const CONTENT: Partial<
  Record<SectionId, ComponentType<{ openTwoFactor?: boolean; next?: string; shippedPhase?: number }>>
> = {
  account: AccountSection,
  users: UsersSection,
  appearance: AppearanceSection,
  network: NetworkSection,
  storage: StorageSection,
  engine: EngineSection,
  updates: UpdatesSection,
  backups: BackupsSection,
  advanced: AdvancedSection,
};

/** Something shown next to a section's title, such as the engine's state. */
const ASIDE: Partial<Record<SectionId, ComponentType>> = {
  users: InviteButton,
  engine: EngineStatus,
  backups: BackupsActions,
};

/**
 * On a phone (D-172): what goes at the right of the bar instead ("Edit", the person-plus), and the sections whose
 * aside is in their content instead (the engine's state is in its card, PhoneRedesignA_Engine).
 */
const PHONE_BAR: Partial<Record<SectionId, ComponentType>> = {
  account: EditProfileButton,
  users: InviteButton,
};
const PHONE_NO_ASIDE = new Set<SectionId>(['users', 'engine']);

/** The browser tab's title (outside the component, so the React compiler leaves `document` alone). */
const setDocumentTitle = (title: string) => {
  document.title = title;
};

export function SectionPage({
  id,
  openTwoFactor,
  next,
  shippedPhase,
}: {
  id: string;
  openTwoFactor?: boolean;
  next?: string;
  /** For tests of a section whose phase hasn't shipped yet. */
  shippedPhase?: number;
}) {
  const me = useMe().data;
  const desktop = useIsDesktop();
  const heading = useRef<HTMLHeadingElement>(null);
  const router = useRouter();
  const navigate = useNavigate();
  const access = me ? sectionAccess(id, me.role, shippedPhase) : null;
  const label = access?.kind === 'ok' ? access.section.label : null;
  useEffect(() => {
    if (!label) return;
    setDocumentTitle(settingsCopy.sectionTitle(label));
    heading.current?.focus();
  }, [label]);

  if (!access) return null;
  if (access.kind !== 'ok') return <AccessDenied kind={access.kind} />;
  const Content = CONTENT[access.section.id];
  const Aside = ASIDE[access.section.id];
  const PhoneBar = PHONE_BAR[access.section.id];
  const content = Content ? (
    <Content openTwoFactor={openTwoFactor} next={next} shippedPhase={shippedPhase} />
  ) : (
    <p className="m-0 text-body text-ink-muted">{settingsCopy.empty}</p>
  );
  if (!desktop)
    // A section on a phone (D-172): "‹ Settings" (Back, or the list after a deep link, US-PHONE-04), the section's
    // name as a large title, then its content on the page, which scrolls as a whole.
    return (
      <section className="flex flex-col gap-4" aria-labelledby="settings-section-heading">
        <PhoneHeader
          title={access.section.label}
          titleId="settings-section-heading"
          titleRef={heading}
          back={{
            label: settingsCopy.back,
            onBack: () => (router.history.canGoBack() ? router.history.back() : void navigate({ to: '/settings' })),
          }}
          barTrailing={PhoneBar ? <PhoneBar /> : undefined}
          trailing={Aside && !PHONE_NO_ASIDE.has(access.section.id) ? <Aside /> : undefined}
        />
        {content}
      </section>
    );
  return (
    // The title stays put while the content scrolls under it and fades out (macOS Settings style). The pane
    // reaches the window's top and right edges; the scrollbar starts below the title and stays clear of the corners.
    <section className="flex min-h-0 flex-1 flex-col" aria-labelledby="settings-section-heading">
      <ScrollPane
        className="flex-1"
        headerClassName={desktop ? 'px-7 pt-7 pb-3' : 'px-5 pt-5 pb-3'}
        scrollClassName={desktop ? 'mr-4 mb-7' : 'mr-2 mb-5'}
        bodyClassName={desktop ? 'pl-7 pr-3 pt-2' : 'pl-5 pr-3 pt-2'}
        data-testid="settings-scroll"
        header={
          <div className="flex items-center justify-between gap-4">
            <h1 id="settings-section-heading" ref={heading} tabIndex={-1} className="m-0 text-title-1 outline-none">
              {access.section.label}
            </h1>
            {Aside ? <Aside /> : null}
          </div>
        }
      >
        {content}
      </ScrollPane>
    </section>
  );
}
