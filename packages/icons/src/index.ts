// @hlabs/icons: the only icon import for hlabs apps (web UI and Tauri tray).
//
//   import { Download, HardDrive } from '@hlabs/icons';    // Lucide, tree-shaken
//   import { TabHome, tabGlyphs } from '@hlabs/icons';      // filled tab-bar glyphs
//   import { LogoMark, LogoLockup } from '@hlabs/icons';    // the hlabs logo
//   import { AppLogo } from '@hlabs/icons';                 // an app's logo with fallback

export * from 'lucide-react';
export * from './tab-glyphs';
export * from './logo';
export * from './app-logo';
export { MARK_PATH, MARK_DOTS, MARK_WIDTH, MARK_HEIGHT } from './paths';

/** Lucide defaults for hlabs UI icons. Spread into an icon or a LucideProvider-style wrapper. */
export const iconDefaults = { size: 20, strokeWidth: 2 } as const;
