// One Settings section (US-ACCT-01): the section, "You don't have access to this" for a member at an admin-only URL
// (no redirect, no admin data asked for), or "Page not found". Opening a section moves focus to its heading.
import { useEffect, useRef, type ComponentType } from 'react';
import { settingsCopy } from '../copy/settings';
import { useMe } from '../lib/use-me';
import { AccessDenied } from '../shell/access-denied';
import { AccountSection } from './account-section';
import { sectionAccess, type SectionId } from './sections';

const CONTENT: Partial<Record<SectionId, ComponentType>> = {
  account: AccountSection,
};

export function SectionPage({ id }: { id: string }) {
  const me = useMe().data;
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
    // The title stays put; only what's under it scrolls (in a scroll area inset from the window's edges).
    <section className="flex min-h-0 flex-1 flex-col gap-6" aria-labelledby="settings-section-heading">
      <h1 id="settings-section-heading" ref={heading} tabIndex={-1} className="m-0 text-title-1 outline-none">
        {access.section.label}
      </h1>
      <div className="hl-scroll -m-1 min-h-0 flex-1 p-1 pr-3" data-testid="settings-scroll">
        {Content ? <Content /> : <p className="m-0 text-body text-ink-muted">{settingsCopy.empty}</p>}
      </div>
    </section>
  );
}
