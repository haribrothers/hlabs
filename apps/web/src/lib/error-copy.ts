// What an error means for people, in one line (US-STATE-12 inline in the confirm dialog; US-STATE-17 completes the
// catalogue). Never the raw message: an unknown error gets the generic line, and no response at all the offline one.
import { TRPCClientError } from '@trpc/client';
import { errorCopy } from '../copy/errors';

interface ErrorData {
  hlabsCode?: string;
  detail?: Record<string, unknown> | null;
}

/** The hlabsCode the daemon sent, or null when nothing answered (offline, or hlabs is down). */
function errorData(err: unknown): ErrorData | null {
  return err instanceof TRPCClientError ? ((err.data as ErrorData | undefined) ?? null) : null;
}

export function errorLine(err: unknown): string {
  const data = errorData(err);
  if (!data) return errorCopy.offline;
  const code = data.hlabsCode as keyof typeof errorCopy.codes | undefined;
  const line = code ? errorCopy.codes[code] : undefined;
  if (typeof line === 'function') return line(data.detail ?? {});
  return line ?? errorCopy.generic;
}
