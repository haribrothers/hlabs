// Settings on an iPad in portrait (US-TAB-05, TabletSettingsPortrait): the window holds the sections as a list you go
// into, in three groups (about you, about the computer, about hlabs) with icon squares, what's in each at the right
// and a chevron; a section then fills the window with "‹ Settings" above its title (TabletSettingsPortraitPage).
import type { AppRouter } from '@hlabs/api';
import {
  Bell,
  Box,
  ChevronRight,
  CodeXml,
  Download,
  Globe,
  HardDrive,
  History,
  iconDefaults,
  Info,
  Palette,
  UserRound,
  Users,
  type LucideIcon,
} from '@hlabs/icons';
import { Link } from '@tanstack/react-router';
import type { inferRouterOutputs } from '@trpc/server';
import { accountCopy } from '../copy/account';
import { settingsCopy } from '../copy/settings';
import { useRowValues } from './phone-settings';
import { sectionPath, type SectionDef, type SectionId } from './sections';

type Me = inferRouterOutputs<AppRouter>['auth']['me'];

const ICONS: Record<SectionId, LucideIcon> = {
  account: UserRound,
  users: Users,
  appearance: Palette,
  notifications: Bell,
  network: Globe,
  storage: HardDrive,
  engine: Box,
  backups: History,
  updates: Download,
  advanced: CodeXml,
  about: Info,
};
const GROUPS: SectionId[][] = [
  ['account', 'users', 'appearance', 'notifications'],
  ['network', 'storage', 'engine', 'backups'],
  ['updates', 'advanced', 'about'],
];

export function TabletSettingsList({
  me,
  sections,
  shippedPhase,
}: {
  me: Me;
  sections: SectionDef[];
  /** Tests set it (D-036). */
  shippedPhase?: number;
}) {
  const open = new Set(sections.map((s) => s.id));
  const values = useRowValues(me, open, shippedPhase);
  const name = me.displayName.trim() || me.username;
  const value = (id: SectionId) =>
    id === 'account'
      ? settingsCopy.accountValue(name, accountCopy.roles[me.role])
      : id === 'users' || id === 'backups' || id === 'storage'
        ? values[id]
        : undefined;
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-8 pt-7 pb-5">
      <h1 className="m-0 text-title-1">{settingsCopy.title}</h1>
      <nav aria-label={settingsCopy.sections} className="mt-5 flex flex-col gap-5">
        {GROUPS.map((ids) => {
          const shown = ids.filter((id) => open.has(id));
          if (!shown.length) return null;
          return (
            <ul key={ids.join()} className="hl-t-list">
              {shown.map((id) => {
                const Glyph = ICONS[id];
                const v = value(id);
                return (
                  <li key={id}>
                    <Link to={sectionPath(id)} className="hl-t-row hl-focus">
                      <span className="hl-t-icon" aria-hidden>
                        <Glyph {...iconDefaults} />
                      </span>
                      <span className="hl-t-title">{settingsCopy.section[id]}</span>
                      {v ? <span className="hl-t-value">{v}</span> : null}
                      {id === 'updates' && values.updates > 0 ? (
                        <span className="hl-t-badge">
                          <span aria-hidden>{values.updates}</span>
                          <span className="sr-only">{settingsCopy.updatesWaiting(values.updates)}</span>
                        </span>
                      ) : null}
                      <ChevronRight aria-hidden {...iconDefaults} className="hl-t-chevron" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          );
        })}
      </nav>
    </div>
  );
}
