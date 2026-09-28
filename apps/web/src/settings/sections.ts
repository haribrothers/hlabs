// The Settings sections (US-ACCT-01): one typed list, read by the sidebar and the route guard. Members see Account,
// Appearance, Notifications and About (07 §7.4); sections wait for their phase (D-036).
import { isFeatureEnabled, type Feature } from '@hlabs/shared';
import { settingsCopy } from '../copy/settings';

export const SECTION_IDS = [
  'account',
  'users',
  'appearance',
  'notifications',
  'network',
  'storage',
  'engine',
  'backups',
  'updates',
  'advanced',
  'about',
] as const;
export type SectionId = (typeof SECTION_IDS)[number];

export interface SectionDef {
  id: SectionId;
  label: string;
  adminOnly: boolean;
  /** The phase feature that brings it; none = phase 1. */
  feature?: Feature;
}

const DEFS: Record<SectionId, Omit<SectionDef, 'id' | 'label'>> = {
  account: { adminOnly: false },
  users: { adminOnly: true, feature: 'people' },
  appearance: { adminOnly: false, feature: 'appearance' },
  notifications: { adminOnly: false, feature: 'notificationPrefs' },
  network: { adminOnly: true, feature: 'remoteAccess' },
  storage: { adminOnly: true, feature: 'storageSettings' },
  engine: { adminOnly: true },
  backups: { adminOnly: true, feature: 'backups' },
  updates: { adminOnly: true, feature: 'hlabsUpdates' },
  advanced: { adminOnly: true, feature: 'advancedSettings' },
  about: { adminOnly: false, feature: 'about' },
};

export const SECTIONS: SectionDef[] = SECTION_IDS.map((id) => ({ id, label: settingsCopy.section[id], ...DEFS[id] }));

export const sectionPath = (id: SectionId) => `/settings/${id}`;

const shipped = (s: SectionDef, shippedPhase?: number) => !s.feature || isFeatureEnabled(s.feature, shippedPhase);

/** The sidebar: what this role can open now, in order. */
export function visibleSections(role: 'admin' | 'member', shippedPhase?: number): SectionDef[] {
  return SECTIONS.filter((s) => shipped(s, shippedPhase) && (role === 'admin' || !s.adminOnly));
}

/** What a section URL shows: the section, the access-denied card, or not found (unknown or not shipped yet). */
export function sectionAccess(
  id: string,
  role: 'admin' | 'member',
  shippedPhase?: number,
): { kind: 'ok'; section: SectionDef } | { kind: 'denied' } | { kind: 'notFound' } {
  const section = SECTIONS.find((s) => s.id === id);
  if (!section || !shipped(section, shippedPhase)) return { kind: 'notFound' };
  if (section.adminOnly && role !== 'admin') return { kind: 'denied' };
  return { kind: 'ok', section };
}
