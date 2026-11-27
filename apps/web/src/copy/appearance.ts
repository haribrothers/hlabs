// Settings › Appearance (US-ACCT-32…35, SettingsAppearance). Sentence case, plain words.
export const appearanceCopy = {
  wallpaper: 'Wallpaper',
  wallpapers: { dusk: 'Dusk', ocean: 'Ocean', forest: 'Forest', custom: 'Your own' },
  uploadPhoto: '+ Upload photo',
  uploadPhotoLabel: 'Upload photo',
  /** Under the upload tile once there's a photo of their own beside it. */
  newPhoto: 'New photo',
  uploading: 'Uploading…',
  wrongPhoto: 'Choose a JPEG, PNG or WebP under 10 MB',
  uploadFailed: "Couldn't upload your photo. Try again.",
  accent: 'Accent colour',
  accents: { violet: 'Violet', mint: 'Mint', amber: 'Amber', rose: 'Rose' },
  homeScreen: 'Home screen',
  showWidgets: 'Show widgets',
  showGreeting: 'Show greeting',
  greetingExample: (greeting: string) => `“${greeting}”`,
  reduceTransparency: 'Reduce transparency',
  reduceTransparencyNote: 'Solid backgrounds instead of glass, easier to read',
  reduceMotion: 'Reduce motion',
  reduceMotionNote: 'Turns off icon bounce and window animations',
  saveFailed: "Couldn't save that. Try again.",
} as const;
