// App settings › Home widget (US-HOME-20, D-157). Sentence case; says where the key goes.
export const widgetKeyCopy = {
  section: 'Home widget',
  apiKey: 'API key',
  added: (app: string) => `Added. The widget reads ${app} with it.`,
  notAdded: 'Not added: the widget needs a key made in the app.',
  add: 'Add key…',
  change: 'Change…',
  remove: 'Remove',
  dialogTitle: (app: string) => `${app}'s API key`,
  keptWhere: "hlabs keeps it in this computer's keychain and only uses it to read the widget's figures.",
  cancel: 'Cancel',
  save: 'Save key',
  saved: 'Key added. The widget updates in a moment.',
  removed: 'Key removed',
} as const;
