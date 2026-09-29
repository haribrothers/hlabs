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

/** A mutation started from a button failed: say so in a danger toast (dialogs and forms show errors inline). */
export function showErrorToast(err: unknown): number {
  const { title, body } = errorText(err);
  return showToast({ tone: 'danger', title, body });
}
