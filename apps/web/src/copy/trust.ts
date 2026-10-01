// Trusting hlabs's certificate on a device (phase 2 feedback, D-097). The full CertGuide is US-SYS-09 (phase 9).
export type DeviceOs = 'mac' | 'windows' | 'ios' | 'android' | 'linux';

export const trustCopy = {
  title: 'Trust hlabs on this device',
  docTitle: 'Trust hlabs · hlabs',
  lead: "hlabs uses its own certificate to keep traffic on your home network private. Your browser doesn't know it yet, so it warns you and can't open apps inside hlabs. Trust it once on each device and every app works.",
  download: 'Download certificate',
  device: 'Your device',
  os: { mac: 'Mac', windows: 'Windows', ios: 'iPhone & iPad', android: 'Android', linux: 'Linux' } satisfies Record<
    DeviceOs,
    string
  >,
  steps: {
    mac: [
      'Choose Download certificate, then open hlabs-ca.crt from your Downloads. Keychain Access adds it to your login keychain.',
      'In Keychain Access, double-click "hlabs Local CA", open Trust and set "When using this certificate" to Always Trust.',
      'Close the window and enter your Mac password to save.',
    ],
    windows: [
      'Choose Download certificate, then open hlabs-ca.crt and choose Install Certificate.',
      'Choose Current User, then "Place all certificates in the following store", Browse, and Trusted Root Certification Authorities.',
      'Choose Finish, then Yes to the security warning.',
    ],
    ios: [
      'In Safari, choose Download certificate, then Allow.',
      'Open Settings › General › VPN & Device Management, choose "hlabs Local CA" and Install.',
      'Open Settings › General › About › Certificate Trust Settings and turn on full trust for "hlabs Local CA".',
    ],
    android: [
      'Choose Download certificate.',
      'Open Settings › Security › More security settings › Encryption & credentials › Install a certificate › CA certificate (the names differ a little between phones).',
      'Choose Install anyway, then pick hlabs-ca.crt from your Downloads.',
    ],
    linux: [
      'Choose Download certificate.',
      'Chrome: open Settings › Privacy and security › Security › Manage certificates › Authorities, choose Import and pick hlabs-ca.crt.',
      'Firefox: open Settings › Privacy & Security › Certificates › View Certificates › Authorities, choose Import, pick hlabs-ca.crt and tick "Trust this CA to identify websites".',
    ],
  } satisfies Record<DeviceOs, string[]>,
  after: 'Then reload this page. You only do this once on each device.',
  close: 'Close',
} as const;
