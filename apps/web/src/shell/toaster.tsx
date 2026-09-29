// Where toasts show: bottom-right on a desktop, above the tab bar on a phone (US-STATE-14). Hovering or focusing
// one holds it; it goes on once the pointer and focus have both left. Up to two buttons each (US-STATE-15).
import { Button, Toast } from '@hlabs/ui';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { toastCopy } from '../copy/toasts';
import { errorLine } from '../lib/error-copy';
import { needsAdmin, runToastMutation, visibleActions } from '../lib/toast-actions';
import {
  dismissToast,
  onScreen,
  pauseToast,
  resumeToast,
  showToast,
  updateToast,
  useToasts,
  type ToastAction,
  type ToastItem,
} from '../lib/toasts';
import { useTRPCClient } from '../lib/trpc';
import { useMe } from '../lib/use-me';

/** The person dealt with it: a notification's toast marks that read, so their other sessions drop it too. */
function useHandled() {
  const client = useTRPCClient();
  return (toast: ToastItem) => {
    dismissToast(toast.id);
    if (toast.notificationId) {
      void client.notifications.markRead.mutate({ ids: [toast.notificationId] }).catch(() => {});
    }
  };
}

function ToastActions({ toast, actions }: { toast: ToastItem; actions: ToastAction[] }) {
  const client = useTRPCClient();
  const handled = useHandled();
  const [running, setRunning] = useState<string | null>(null);
  if (actions.length === 0) return null;

  const run = async (a: Extract<ToastAction, { kind: 'mutation' }>) => {
    setRunning(a.procedure);
    try {
      await runToastMutation(client, a.procedure, a.input);
      handled(toast);
      showToast({ tone: 'success', title: a.done ?? toastCopy.done[a.procedure] });
    } catch (err) {
      // The toast stays, saying what went wrong this time.
      updateToast(toast.id, { body: errorLine(err) });
      setRunning(null);
    }
  };

  return (
    <div className="flex flex-wrap gap-2 pt-1">
      {actions.map((a) =>
        a.kind === 'navigate' ? (
          <Link
            key={a.label}
            to={a.to}
            onClick={() => handled(toast)}
            className="hl-btn hl-btn-secondary hl-btn-sm hl-focus"
          >
            {a.label}
          </Link>
        ) : (
          <Button
            key={a.label}
            variant="secondary"
            size="sm"
            busy={running === a.procedure}
            disabled={running !== null}
            onClick={() => void run(a)}
          >
            {a.label}
          </Button>
        ),
      )}
    </div>
  );
}

export function Toaster() {
  const toasts = useToasts();
  const handled = useHandled();
  // Only ask who's signed in when a toast has an admin-only button.
  const needsRole = toasts.some((t) => t.actions?.some(needsAdmin));
  const me = useMe(needsRole);
  const isAdmin = me.data?.role === 'admin';
  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-24 z-50 flex flex-col items-end gap-2 sm:inset-x-auto sm:right-6 sm:bottom-6">
      {/* Newest on top; the rest wait (US-STATE-16). */}
      {onScreen(toasts)
        .reverse()
        .map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto w-full sm:w-auto"
            onMouseEnter={() => pauseToast(t.id, 'hover')}
            onMouseLeave={() => resumeToast(t.id, 'hover')}
            onFocus={() => pauseToast(t.id, 'focus')}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget)) resumeToast(t.id, 'focus');
            }}
          >
            <Toast
              tone={t.tone}
              title={t.title}
              leaving={t.leaving}
              onDismiss={() => handled(t)}
              action={<ToastActions toast={t} actions={visibleActions(t.actions, { isAdmin })} />}
            >
              {t.body}
            </Toast>
          </div>
        ))}
    </div>
  );
}
