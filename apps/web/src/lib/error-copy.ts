// What an error means for people (US-STATE-17): the title and body for its hlabsCode, filled from its detail. An
// unknown or missing code gets the generic copy, and nothing answering (offline, or hlabs down) the offline copy.
// The raw message only goes to the browser console, never on screen.
import { TRPCClientError } from '@trpc/client';
import { errorCopy, type ErrorText } from '../copy/errors';
import { showToast } from './toasts';

interface ErrorData {
  hlabsCode?: string;
  detail?: Record<string, unknown> | null;
}

/** What the daemon sent, or null when nothing answered. */
function errorData(err: unknown): ErrorData | null {
  return err instanceof TRPCClientError ? ((err.data as ErrorData | undefined) ?? null) : null;
}

/** The error's hlabsCode, if the daemon sent one. */
export const errorCode = (err: unknown): string | null => errorData(err)?.hlabsCode ?? null;

const catalogue = errorCopy.codes as Record<string, ((detail: Record<string, unknown>) => ErrorText) | undefined>;

export function errorText(err: unknown): ErrorText {
  const data = errorData(err);
  if (!data) {
    if (!(err instanceof TRPCClientError)) console.error(err);
    return errorCopy.offline;
  }
  const copy = data.hlabsCode ? catalogue[data.hlabsCode] : undefined;
  if (!copy) {
    console.error(err);
    return errorCopy.generic;
  }
  return copy(data.detail ?? {});
}

/** Title and body as one line, for inline errors in a dialog or form. */
export function errorLine(err: unknown): string {
  const { title, body } = errorText(err);
  return `${title}. ${body}`;
}

/** A mutation started from a button failed: say so in a danger toast (dialogs and forms show errors inline). The
 * same error again updates that toast. */
export function showErrorToast(err: unknown): number {
  const { title, body } = errorText(err);
  return showToast({ tone: 'danger', title, body, key: `error:${errorCode(err) ?? 'unknown'}` });
}

export const isForbidden = (err: unknown) => errorCode(err) === 'ACCESS_DENIED';

/** Spread into the query that a whole page depends on: FORBIDDEN then shows "You don't have access to this" at the
 * same URL (the root route's error component) instead of a half-empty page (US-STATE-20). */
export const pageQuery = { throwOnError: (err: unknown) => isForbidden(err) } as const;

/**
 * The same answer for every mutation (US-STATE-20): FORBIDDEN is a danger toast "You don't have access to that." and
 * nothing else changes; JOB_EXCLUSIVE_RUNNING a warning toast naming what's running. Mutations that show their
 * errors inline (`meta.inlineErrors`, such as confirm dialogs) are left to do that.
 */
/** Errors every mutation already answers (a toast, or going to log in); a screen's own "couldn't save" toast steps
 * aside. */
export const handledGlobally = (err: unknown) => {
  const code = errorCode(err);
  return code === 'ACCESS_DENIED' || code === 'JOB_EXCLUSIVE_RUNNING' || code === 'AUTH_REQUIRED';
};

export function mutationErrorNotice(err: unknown, meta: Record<string, unknown> | undefined) {
  if (meta?.inlineErrors) return;
  const code = errorCode(err);
  if (code === 'ACCESS_DENIED') {
    showToast({ tone: 'danger', title: errorCopy.forbiddenToast, key: 'error:ACCESS_DENIED' });
  } else if (code === 'JOB_EXCLUSIVE_RUNNING') {
    const { title, body } = errorText(err);
    showToast({ tone: 'warning', title, body, key: 'error:JOB_EXCLUSIVE_RUNNING' });
  }
}
