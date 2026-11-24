// PhoneSettings (D-172, PhoneRedesignA_Settings): "Settings" as a large title, the person's own card (their account),
// then the sections this person can open as inset grouped lists with 30px icon squares: about them (Users,
// Notifications, Appearance), about the computer (Backups and Live usage in their Dock colours, Network, Storage),
// and about hlabs (Engine, Updates, Advanced, About). The sections are those of the desktop's sidebar.
import type { AppRouter } from '@hlabs/api';
import {
  Bell,
  Box,
  Download,
  Gauge,
  Globe,
  HardDrive,
  History,
  iconDefaults,
  Info,
  Palette,
  SlidersHorizontal,
  Users,
  type LucideIcon,
} from '@hlabs/icons';
import { formatBytes, isFeatureEnabled } from '@hlabs/shared';
import { useQuery } from '@tanstack/react-query';
import { Avatar, avatarColorFor, InsetRowContent, insetRowClass, PhoneHeader } from '@hlabs/ui';
import { Link } from '@tanstack/react-router';
import type { inferRouterOutputs } from '@trpc/server';
import { accountCopy } from '../copy/account';
import { settingsCopy } from '../copy/settings';
import { timeAgo } from '../lib/relative-time';
import { useTRPC } from '../lib/trpc';
import { usePendingUpdates } from '../shell/pending-updates';
import { sectionPath, type SectionDef, type SectionId } from './sections';

type Me = inferRouterOutputs<AppRouter>['auth']['me'];

const ICONS: Record<SectionId, LucideIcon> = {
  account: Users,
  users: Users,
  notifications: Bell,
  appearance: Palette,
  backups: History,
  network: Globe,
  storage: HardDrive,
  engine: Box,
  updates: Download,
  advanced: SlidersHorizontal,
  about: Info,
};
const TONE: Partial<Record<SectionId, 'backups'>> = { backups: 'backups' };
const GROUPS: SectionId[][] = [
  ['users', 'notifications', 'appearance'],
  ['backups', 'network', 'storage'],
  ['engine', 'updates', 'advanced', 'about'],
];

/**
 * The values at the right of some rows (PhoneRedesignA_Settings): how many people (admins), when the last backup ran
 * (or "Not set up"), the free space, and the App Store's update count as a badge. Each loads on its own and shows
 * nothing while it loads or if it fails; the list never waits for them.
 */
export function useRowValues(me: Me, open: Set<SectionId>, shippedPhase?: number) {
  const trpc = useTRPC();
  const admin = me.role === 'admin';
  const users = useQuery({ ...trpc.users.list.queryOptions(), enabled: admin && open.has('users'), retry: false });
  const backups = useQuery({ ...trpc.backups.overview.queryOptions(), enabled: open.has('backups'), retry: false });
  const storage = useQuery({ ...trpc.storage.summary.queryOptions(), enabled: open.has('storage'), retry: false });
  const updates = usePendingUpdates(admin, shippedPhase);
  const o = backups.data;
  const lastRun = o?.lastRun ? (o.lastRun.finishedAt ?? o.lastRun.startedAt) : null;
  return {
    users: users.data ? String(users.data.users.length) : undefined,
    backups: o
      ? o.destinations.length === 0
        ? settingsCopy.notSetUp
        : lastRun
          ? timeAgo(lastRun)
          : undefined
      : undefined,
    storage: storage.data ? settingsCopy.free(formatBytes(storage.data.freeBytes)) : undefined,
    updates,
  };
}

export function PhoneSettingsList({
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
  const usage = isFeatureEnabled('liveUsage') && (me.role === 'admin' || me.canSeeUsage);
  const row = (id: SectionId) => {
    const Glyph = ICONS[id];
    return (
      <Link key={id} to={sectionPath(id)} className={insetRowClass()}>
        <InsetRowContent
          icon={<Glyph aria-hidden {...iconDefaults} />}
          tone={TONE[id]}
          title={settingsCopy.section[id]}
          value={id === 'users' || id === 'backups' || id === 'storage' ? values[id] : undefined}
          trailing={
            id === 'updates' && values.updates > 0 ? (
              <span className="hl-p-badge">
                <span aria-hidden>{values.updates}</span>
                <span className="sr-only">{settingsCopy.updatesWaiting(values.updates)}</span>
              </span>
            ) : undefined
          }
          chevron
        />
      </Link>
    );
  };
  return (
    <>
      <PhoneHeader title={settingsCopy.title} />
      <nav aria-label={settingsCopy.sections} className="flex flex-col gap-5">
        {open.has('account') ? (
          <div className="hl-p-group">
            <Link
              to={sectionPath('account')}
              className={`${insetRowClass()} py-2.5`}
              aria-label={settingsCopy.section.account}
              aria-describedby="phone-settings-me"
            >
              <InsetRowContent
                leading={
                  <Avatar
                    name={name}
                    color={avatarColorFor(me.username, me.avatarColor)}
                    size="xl"
                    className="hl-p-avatar"
                  />
                }
                title={
                  <span id="phone-settings-me" className="text-title-2 font-semibold">
                    {name}
                  </span>
                }
                subtitle={settingsCopy.accountLine(accountCopy.roles[me.role])}
                chevron
              />
            </Link>
          </div>
        ) : null}
        {GROUPS.map((ids, i) => {
          const shown = ids.filter((id) => open.has(id));
          const withUsage = i === 1 && usage;
          if (!shown.length && !withUsage) return null;
          return (
            <div key={ids.join()} className="hl-p-group">
              {shown.filter((id) => id === 'backups').map(row)}
              {withUsage ? (
                <Link to="/usage" className={insetRowClass()}>
                  <InsetRowContent
                    icon={<Gauge aria-hidden {...iconDefaults} />}
                    tone="usage"
                    title={settingsCopy.liveUsage}
                    chevron
                  />
                </Link>
              ) : null}
              {shown.filter((id) => id !== 'backups').map(row)}
            </div>
          );
        })}
      </nav>
    </>
  );
}
