// The shared confirm dialog (US-STATE-11): `confirm({...})` asks, and resolves true once confirmed (after
// `onConfirm` settles) or false when dismissed. One at a time: a second call waits until the first closes.
// <ConfirmHost /> in the root route shows them.
import { Button, ModalDialog } from '@hlabs/ui';
import { useRef, useState, useSyncExternalStore } from 'react';
import { confirmCopy } from '../copy/confirm';
import { useIsDesktop } from './use-media';

const copy = confirmCopy;

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
  /** The action; the dialog stays open, busy, until it settles. */
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

function settle(id: number, confirmed: boolean) {
  const request = queue.find((r) => r.id === id);
  if (!request) return;
  publish(queue.filter((r) => r.id !== id));
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
  const { id, options } = request;
  const danger = options.tone === 'danger';
  const isDesktop = useIsDesktop();
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [pending, setPending] = useState(false);

  const run = async () => {
    setPending(true);
    try {
      await options.onConfirm?.();
      settle(id, true);
    } catch {
      settle(id, false);
    }
  };

  const cancel = (
    <Button key="cancel" ref={cancelRef} variant="secondary" onClick={() => settle(id, false)}>
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
      onOpenChange={(open) => (open ? null : settle(id, false))}
      role="alertdialog"
      title={options.title}
      description={options.body}
      initialFocus={danger ? cancelRef : confirmRef}
      sheetOnPhone
      // Desktop: Cancel then the verb on the right; phone: the verb above Cancel.
      actions={isDesktop ? [cancel, go] : [go, cancel]}
    />
  );
}
