// Where toasts show: bottom-right on a desktop, above the tab bar on a phone (US-STATE-14). Hovering or focusing
// one holds it; it goes on once the pointer and focus have both left. Up to two buttons each (US-STATE-15).
import { Button, Toast } from '@hlabs/ui';
import { Link } from '@tanstack/react-router';
import { overlayForPath, useAppOverlay } from '../apps/app-overlay';
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
        a.kind === 'navigate' && overlayForPath(a.to) ? (
          // An app's settings or logs open over the page (D-166).
          <OverlayLink key={a.label} to={a.to} label={a.label} onFollow={() => handled(toast)} />
        ) : a.kind === 'navigate' ? (
          <Link
            key={a.label}
            to={a.to}
            onClick={() => handled(toast)}
            className="hl-btn hl-btn-secondary hl-btn-sm hl-focus"
          >
            {a.label}
          </Link>
        ) : a.kind === 'help' ? (
          <a
            key={a.label}
            href={a.href}
            target="_blank"
            rel="noopener noreferrer"
            className="hl-btn hl-btn-secondary hl-btn-sm hl-focus"
          >
            {a.label}
            <span className="sr-only">{` ${toastCopy.newTab}`}</span>
          </a>
        ) : a.kind === 'retry' ? (
          <Button
            key={a.label}
            variant="secondary"
            size="sm"
            onClick={() => {
              handled(toast);
              a.run();
            }}
          >
            {a.label}
          </Button>
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
  return (
    // Always there, and a live region: a dialog (App settings, Logs) hides the rest of the page from assistive tech
    // but keeps live regions (aria-hidden), so toasts that arrive while one is open are still read and can be used;
    // the dialogs leave presses here alone (`data-hl-toasts`, ModalPanel).
    <div
      data-hl-toasts=""
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 bottom-24 z-50 flex flex-col items-end gap-2 sm:inset-x-auto sm:right-6 sm:bottom-28"
    >
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
              progress={t.progress}
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

/** A toast's link to an app's settings or logs: they open over the page (D-166). */
function OverlayLink({ to, label, onFollow }: { to: string; label: string; onFollow: () => void }) {
  const overlay = useAppOverlay();
  return (
    <button
      type="button"
      onClick={() => {
        onFollow();
        overlay.follow(to);
      }}
      className="hl-btn hl-btn-secondary hl-btn-sm hl-focus"
    >
      {label}
    </button>
  );
}
