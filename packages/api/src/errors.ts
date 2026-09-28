// The hlabs error catalogue (docs/prd/05-api.md §Conventions). Procedures throw TRPCError with an
// hlabsCode in `cause`; the UI maps the code to copy and never shows raw error text.
import { TRPCError, type TRPC_ERROR_CODE_KEY } from '@trpc/server';

export const HLABS_ERRORS = {
  // General
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
  VALIDATION_FAILED: 'BAD_REQUEST',
  NOT_FOUND: 'NOT_FOUND',
  AUTH_REQUIRED: 'UNAUTHORIZED',
  ACCESS_DENIED: 'FORBIDDEN',
  /** A session mutation without the right x-hlabs-csrf header, or from another origin (07 §7.3). */
  CSRF_REJECTED: 'FORBIDDEN',
  INTERNAL: 'INTERNAL_SERVER_ERROR',
  JOB_EXCLUSIVE_RUNNING: 'CONFLICT',
  JOB_NOT_CANCELLABLE: 'PRECONDITION_FAILED',
  DAEMON_STARTING: 'SERVICE_UNAVAILABLE',
  DISK_FULL: 'INTERNAL_SERVER_ERROR',

  // Sign in, accounts and people
  AUTH_INVALID_CREDENTIALS: 'BAD_REQUEST',
  AUTH_INVALID_PASSWORD: 'BAD_REQUEST',
  AUTH_LOCKED: 'TOO_MANY_REQUESTS',
  AUTH_TOTP_INVALID: 'BAD_REQUEST',
  AUTH_CHALLENGE_EXPIRED: 'BAD_REQUEST',
  AUTH_RESET_EXPIRED: 'BAD_REQUEST',
  AUTH_SECRET_UNAVAILABLE: 'INTERNAL_SERVER_ERROR',
  TOTP_INVALID_CODE: 'BAD_REQUEST',
  TOTP_REQUIRED_SELF_FIRST: 'PRECONDITION_FAILED',
  TOTP_REQUIRED_BY_ADMIN: 'PRECONDITION_FAILED',
  TRAY_TOKEN_REJECTED: 'UNAUTHORIZED',
  PASSWORD_TOO_SHORT: 'BAD_REQUEST',
  PASSWORD_TOO_COMMON: 'BAD_REQUEST',
  PASSWORD_UNCHANGED: 'BAD_REQUEST',
  USERNAME_INVALID: 'BAD_REQUEST',
  USERNAME_TAKEN: 'CONFLICT',
  LAST_ADMIN: 'PRECONDITION_FAILED',

  // Onboarding
  ONBOARDING_SETUP_TOKEN_REQUIRED: 'FORBIDDEN',
  ONBOARDING_COMPLETE: 'FORBIDDEN',
  ONBOARDING_USERS_EXIST: 'CONFLICT',
  ONBOARDING_INCOMPLETE: 'PRECONDITION_FAILED',
  ONBOARDING_STEP_INVALID: 'PRECONDITION_FAILED',

  // Engine
  ENGINE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  ENGINE_START_FAILED: 'INTERNAL_SERVER_ERROR',
  ENGINE_INSTALL_UNSUPPORTED: 'BAD_REQUEST',
  ENGINE_DOWNLOAD_TIMEOUT: 'TIMEOUT',

  // Apps
  APP_PORT_IN_USE: 'CONFLICT',
  APP_NO_PLATFORM: 'PRECONDITION_FAILED',
  APP_NETWORK_UNREACHABLE: 'BAD_GATEWAY',
  APP_HEALTH_TIMEOUT: 'TIMEOUT',
  APP_HAS_DEPENDENTS: 'PRECONDITION_FAILED',
  APP_ENV_INVALID: 'BAD_REQUEST',
  APP_DISK_FULL: 'INTERNAL_SERVER_ERROR',
  HOSTNAME_TAKEN: 'CONFLICT',

  // Storage, files and network
  STORAGE_NOT_WRITABLE: 'BAD_REQUEST',
  NAS_UNREACHABLE: 'BAD_GATEWAY',
  NAS_AUTH_FAILED: 'BAD_REQUEST',
  NAS_READ_ONLY: 'BAD_REQUEST',
  /** Linux: the privileged mount helper isn't installed yet (D-061). */
  NAS_HELPER_MISSING: 'PRECONDITION_FAILED',
  FILES_ACCESS_DENIED: 'FORBIDDEN',
  FILES_READ_ONLY: 'FORBIDDEN',
  FILES_NO_SPACE: 'INTERNAL_SERVER_ERROR',
  FILES_NAME_EXISTS: 'CONFLICT',
  FILES_INVALID_PATH: 'BAD_REQUEST',
  FILES_INVALID_NAME: 'BAD_REQUEST',
  NETWORK_PORT_IN_USE: 'CONFLICT',
  TAILSCALE_HTTPS_DISABLED: 'PRECONDITION_FAILED',

  // Backups and restore
  BACKUP_DEST_UNREACHABLE: 'BAD_GATEWAY',
  BACKUP_DEST_AUTH_FAILED: 'BAD_REQUEST',
  BACKUP_DEST_FULL: 'INTERNAL_SERVER_ERROR',
  BACKUP_DEST_DUPLICATE: 'CONFLICT',
  BACKUP_REPO_LOCKED: 'CONFLICT',
  BACKUP_REPO_PASSWORD_WRONG: 'BAD_REQUEST',
  BACKUP_PREHOOK_FAILED: 'INTERNAL_SERVER_ERROR',
  BACKUP_INTERRUPTED: 'INTERNAL_SERVER_ERROR',
  RESTORE_NOT_CANCELLABLE: 'PRECONDITION_FAILED',

  // Updates
  UPDATE_SIGNATURE_INVALID: 'BAD_REQUEST',
} as const satisfies Record<string, TRPC_ERROR_CODE_KEY>;

export type HlabsCode = keyof typeof HLABS_ERRORS;
export const HLABS_CODES = Object.keys(HLABS_ERRORS) as HlabsCode[];

export function isHlabsCode(value: unknown): value is HlabsCode {
  return typeof value === 'string' && Object.hasOwn(HLABS_ERRORS, value);
}

/** The `cause` of every TRPCError hlabs throws. */
export class HlabsError extends Error {
  override readonly name = 'HlabsError';
  constructor(
    readonly hlabsCode: HlabsCode,
    message: string = hlabsCode,
    readonly detail?: Record<string, unknown>,
  ) {
    super(message);
  }
}

/** `throw hlabsError('AUTH_LOCKED', 'Locked until 10:15', { until })` */
export function hlabsError(code: HlabsCode, message?: string, detail?: Record<string, unknown>): TRPCError {
  return new TRPCError({
    code: HLABS_ERRORS[code],
    message: message ?? code,
    cause: new HlabsError(code, message, detail),
  });
}

/** Reads the hlabsCode off any error; unknown errors become INTERNAL. */
export function hlabsCodeOf(error: unknown): HlabsCode {
  if (error instanceof TRPCError) {
    if (error.cause instanceof HlabsError) return error.cause.hlabsCode;
    if (error.code === 'BAD_REQUEST' || error.code === 'PARSE_ERROR') return 'VALIDATION_FAILED';
    if (error.code === 'UNAUTHORIZED') return 'AUTH_REQUIRED';
    if (error.code === 'FORBIDDEN') return 'ACCESS_DENIED';
    if (error.code === 'NOT_FOUND') return 'NOT_FOUND';
    if (error.code === 'NOT_IMPLEMENTED') return 'NOT_IMPLEMENTED';
  }
  if (error instanceof HlabsError) return error.hlabsCode;
  return 'INTERNAL';
}
