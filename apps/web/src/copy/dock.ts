// Pinned apps in the Dock (US-HOME-22; DockStates). Sentence case.
export const dockCopy = {
  addToDock: 'Add to Dock',
  add: 'Add',
  addApp: (app: string) => `Add ${app} to the Dock`,
  hint: 'Or drag an app from Home onto the Dock. Up to 8 apps.',
  full: 'Your Dock is full. Remove an app to add another.',
  allPinned: 'Every app you can open is in the Dock.',
  open: 'Open',
  openInNewTab: 'Open in a new tab',
  appSettings: 'App settings',
  remove: 'Remove from Dock',
} as const;
