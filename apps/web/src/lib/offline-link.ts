// While offline or reconnecting (US-STATE-19), mutations fail at once with a warning toast instead of calling the
// daemon; the error carries no response, so dialogs and forms show the offline line.
import type { AppRouter } from '@hlabs/api';
import { TRPCClientError, type TRPCLink } from '@trpc/client';
import { observable } from '@trpc/server/observable';
import { shellCopy } from '../copy/shell';
import { connectionProblem } from './connection';
import { showToast } from './toasts';

export function offlineLink(): TRPCLink<AppRouter> {
  return () =>
    ({ op, next }) =>
      observable((observer) => {
        if (op.type === 'mutation' && connectionProblem()) {
          showToast({ tone: 'warning', title: shellCopy.offlineToast, key: 'connection.offline' });
          observer.error(TRPCClientError.from(new Error('offline')));
          return;
        }
        return next(op).subscribe(observer);
      });
}
