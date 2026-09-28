// One Settings section (US-ACCT-01): the section, "You don't have access to this" for a member at an admin-only URL
// (no redirect, no admin data asked for), or "Page not found". Opening a section moves focus to its heading.
import { ScrollPane } from '@hlabs/ui';
import { useEffect, useRef, type ComponentType } from 'react';
import { settingsCopy } from '../copy/settings';
import { useIsDesktop } from '../lib/use-media';
import { useMe } from '../lib/use-me';
import { AccessDenied } from '../shell/access-denied';
import { AccountSection } from './account-section';
import { sectionAccess, type SectionId } from './sections';

const CONTENT: Partial<Record<SectionId, ComponentType<{ openTwoFactor?: boolean; next?: string }>>> = {
  account: AccountSection,
};

export function SectionPage({ id, openTwoFactor, next }: { id: string; openTwoFactor?: boolean; next?: string }) {
  const me = useMe().data;
  const desktop = useIsDesktop();
  const heading = useRef<HTMLHeadingElement>(null);
  const access = me ? sectionAccess(id, me.role) : null;
  const label = access?.kind === 'ok' ? access.section.label : null;
  useEffect(() => {
    if (!label) return;
    document.title = settingsCopy.sectionTitle(label);
    heading.current?.focus();
  }, [label]);

  if (!access) return null;
  if (access.kind !== 'ok') return <AccessDenied kind={access.kind} />;
  const Content = CONTENT[access.section.id];
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
          <h1 id="settings-section-heading" ref={heading} tabIndex={-1} className="m-0 text-title-1 outline-none">
            {access.section.label}
          </h1>
        }
      >
        {Content ? (
          <Content openTwoFactor={openTwoFactor} next={next} />
        ) : (
          <p className="m-0 text-body text-ink-muted">{settingsCopy.empty}</p>
        )}
      </ScrollPane>
    </section>
  );
}
