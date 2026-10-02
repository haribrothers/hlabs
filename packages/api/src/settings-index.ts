// The settings pages search can find (US-HOME-10): a static index, filtered by role and phase where it's searched.
// Titles match the Settings sidebar; keywords are what people might type instead.
import type { Feature } from '@hlabs/shared';

export interface SettingsIndexEntry {
  /** The Settings section: `/settings/<section>`. */
  section: string;
  title: string;
  keywords: readonly string[];
  adminOnly: boolean;
  /** The phase feature that brings it; none = phase 1. */
  feature?: Feature;
}

export const SETTINGS_INDEX: readonly SettingsIndexEntry[] = [
  {
    section: 'account',
    title: 'Account',
    keywords: ['password', 'two-factor', '2fa', 'recovery codes', 'display name', 'profile', 'sign out'],
    adminOnly: false,
  },
  {
    section: 'users',
    title: 'Users',
    keywords: ['people', 'members', 'invite', 'family'],
    adminOnly: true,
    feature: 'people',
  },
  {
    section: 'appearance',
    title: 'Appearance',
    keywords: ['wallpaper', 'theme', 'accent', 'dark', 'glass'],
    adminOnly: false,
    feature: 'appearance',
  },
  {
    section: 'notifications',
    title: 'Notifications',
    keywords: ['alerts'],
    adminOnly: false,
    feature: 'notificationPrefs',
  },
  {
    section: 'network',
    title: 'Network & remote access',
    keywords: ['tailscale', 'tailnet', 'hostname', 'address', 'remote'],
    adminOnly: true,
    feature: 'remoteAccess',
  },
  {
    section: 'storage',
    title: 'Storage',
    keywords: ['disk', 'drives', 'nas', 'space'],
    adminOnly: true,
    feature: 'storageSettings',
  },
  {
    section: 'engine',
    title: 'Engine & startup',
    keywords: ['docker', 'colima', 'orbstack', 'containers', 'start at login', 'startup', 'keep awake'],
    adminOnly: true,
  },
  {
    section: 'backups',
    title: 'Backups',
    keywords: ['restic', 'restore', 'snapshot'],
    adminOnly: true,
    feature: 'backups',
  },
  { section: 'updates', title: 'Updates', keywords: ['version', 'upgrade'], adminOnly: true, feature: 'hlabsUpdates' },
  {
    section: 'advanced',
    title: 'Advanced',
    keywords: ['diagnostics', 'reset', 'logs'],
    adminOnly: true,
    feature: 'advancedSettings',
  },
  { section: 'about', title: 'About', keywords: ['version', 'licence', 'license'], adminOnly: false, feature: 'about' },
];
