// An app's environment variable names (US-APP-13), shared by the daemon's checks and App settings' form.

/** A variable name people may use: UPPER_SNAKE_CASE. */
export const ENV_NAME_PATTERN = /^[A-Z_][A-Z0-9_]*$/;

/** Names hlabs sets for every app (06 §Variables available to compose), which people can't add or change. */
export const isReservedEnvName = (name: string) =>
  name.startsWith('HLABS_') || name === 'TZ' || name === 'PUID' || name === 'PGID';
