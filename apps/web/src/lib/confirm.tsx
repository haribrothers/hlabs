// The shared confirm dialog (US-STATE-11, 12): `confirm({...})` asks, and resolves true once confirmed (after
// `onConfirm` settles) or false when dismissed. One at a time: a second call waits until the first closes.
// While the action runs the dialog is busy and can't be dismissed; if it fails the error shows inline and the
// buttons come back; after 30 s the dialog closes and the result arrives as a toast. <ConfirmHost /> shows them.
import { Button, ModalDialog } from '@hlabs/ui';
import { useRef, useState, useSyncExternalStore } from 'react';
import { confirmCopy } from '../copy/confirm';
import { errorLine } from './error-copy';
import { showToast } from './toasts';
import { useIsDesktop } from './use-media';

const copy = confirmCopy;

/** How long the dialog waits for its action before handing the result to a toast. */
export const CONFIRM_PENDING_MS = 30_000;

export type ConfirmTone = 'default' | 'danger';

export interface ConfirmOptions {
  /** A question naming the thing: "Restart all apps?", "Uninstall Immich?". */
  title: string;
  /** What will happen: "Apps will be unavailable for about a minute." */
  body: string;
  /** The verb: "Restart", "Uninstall". */
  confirmLabel: string;
  /** 'danger' for destructive actions: the red button, and Cancel has focus first. */
  tone?: ConfirmTone;
  /** The action; the dialog stays open, busy, until it settles. Resolving (with `{ jobId }` for long work) closes
   * it; rejecting keeps it open with the error inline. */
  onConfirm?: () => unknown;
}

interface Request {
  id: number;
  options: ConfirmOptions;
  resolve: (confirmed: boolean) => void;
}

let queue: readonly Request[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

const publish = (next: readonly Request[]) => {
  queue = next;
  for (const l of listeners) l();
};

export function confirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => publish([...queue, { id: nextId++, options, resolve }]));
}

/** Closes the dialog; the caller's promise waits for the action if it still runs. */
function close(id: number) {
  if (queue.some((r) => r.id === id)) publish(queue.filter((r) => r.id !== id));
}

function settle(request: Request, confirmed: boolean) {
  close(request.id);
  request.resolve(confirmed);
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Shows the first waiting confirmation. */
export function ConfirmHost() {
  const waiting = useSyncExternalStore(subscribe, () => queue);
  const current = waiting[0];
  return current ? <ConfirmDialog key={current.id} request={current} /> : null;
}

function ConfirmDialog({ request }: { request: Request }) {
  const { options } = request;
  const danger = options.tone === 'danger';
  const isDesktop = useIsDesktop();
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setPending(true);
    setError(null);
    // Never trap people: after 30 s the dialog goes and the outcome arrives as a toast.
    let handedOff = false;
    const handOff = setTimeout(() => {
      handedOff = true;
      close(request.id);
    }, CONFIRM_PENDING_MS);
    try {
      await options.onConfirm?.();
      clearTimeout(handOff);
      if (handedOff) showToast({ tone: 'success', title: copy.finished(options.confirmLabel) });
      settle(request, true);
    } catch (err) {
      clearTimeout(handOff);
      if (handedOff) {
        showToast({ tone: 'danger', title: errorLine(err) });
        settle(request, false);
        return;
      }
      setPending(false);
      setError(errorLine(err));
    }
  };

  const cancel = (
    <Button key="cancel" ref={cancelRef} variant="secondary" disabled={pending} onClick={() => settle(request, false)}>
      {copy.cancel}
    </Button>
  );
  const go = (
    <Button
      key="confirm"
      ref={confirmRef}
      variant={danger ? 'destructive' : 'primary'}
      busy={pending}
      onClick={() => void run()}
    >
      {options.confirmLabel}
    </Button>
  );
  return (
    <ModalDialog
      open
      onOpenChange={(open) => (open ? null : settle(request, false))}
      dismissible={!pending}
      role="alertdialog"
      title={options.title}
      description={options.body}
      initialFocus={danger ? cancelRef : confirmRef}
      sheetOnPhone
      // Desktop: Cancel then the verb on the right; phone: the verb above Cancel.
      actions={isDesktop ? [cancel, go] : [go, cancel]}
    >
      {error ? (
        <p role="alert" className="m-0 text-body-sm text-danger">
          {error}
        </p>
      ) : null}
    </ModalDialog>
  );
}
