// The shared confirm dialog (US-STATE-11, 12): `confirm({...})` asks, and resolves true once confirmed (after
// `onConfirm` settles) or false when dismissed. One at a time: a second call waits until the first closes.
// While the action runs the dialog is busy and can't be dismissed; if it fails the error shows inline and the
// buttons come back; after 30 s the dialog closes and the result arrives as a toast. The riskiest actions also ask
// for the password or a typed name (US-STATE-13, 07 §7.8). <ConfirmHost /> shows them.
import { Button, ModalDialog, TextField } from '@hlabs/ui';
import { useId, useRef, useState, useSyncExternalStore } from 'react';
import { confirmCopy } from '../copy/confirm';
import { errorCode, errorLine } from './error-copy';
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
   * it; rejecting keeps it open with the error inline. Gets the password when `requirePassword` is set; the caller's
   * mutation carries it (there's no separate verify call). */
  onConfirm?: (input: { password?: string }) => unknown;
  /** Ask for the person's password (restore, factory reset). A wrong one is AUTH_INVALID_PASSWORD from the call. */
  requirePassword?: boolean;
  /** Ask them to type this exactly (the hostname for factory reset). */
  typeToConfirm?: string;
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
  const formId = useId();
  const passwordRef = useRef<HTMLInputElement>(null);
  const typedRef = useRef<HTMLInputElement>(null);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const hasFields = Boolean(options.requirePassword) || options.typeToConfirm !== undefined;
  const ready =
    (!options.requirePassword || password.length > 0) &&
    (options.typeToConfirm === undefined || typed.trim() === options.typeToConfirm);

  // A field to fill comes first; otherwise the verb, or Cancel when it can't be undone.
  const firstField = options.requirePassword ? passwordRef : hasFields ? typedRef : null;
  const initialFocus = firstField ?? (danger ? cancelRef : confirmRef);

  const run = async () => {
    if (!ready || pending) return;
    setPending(true);
    setError(null);
    // Never trap people: after 30 s the dialog goes and the outcome arrives as a toast.
    let handedOff = false;
    const handOff = setTimeout(() => {
      handedOff = true;
      close(request.id);
    }, CONFIRM_PENDING_MS);
    try {
      await options.onConfirm?.(options.requirePassword ? { password } : {});
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
      if (options.requirePassword && errorCode(err) === 'AUTH_INVALID_PASSWORD') {
        setPassword('');
        setPasswordError(copy.wrongPassword);
        passwordRef.current?.focus();
        return;
      }
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
      // With fields, Enter in them confirms too.
      {...(hasFields ? { type: 'submit' as const, form: formId } : { onClick: () => void run() })}
      variant={danger ? 'destructive' : 'primary'}
      busy={pending}
      disabled={!ready}
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
      initialFocus={initialFocus}
      sheetOnPhone
      // Desktop: Cancel then the verb on the right; phone: the verb above Cancel.
      actions={isDesktop ? [cancel, go] : [go, cancel]}
    >
      {hasFields || error ? (
        <>
          {hasFields ? (
            <form
              id={formId}
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                void run();
              }}
            >
              {options.requirePassword ? (
                <TextField
                  ref={passwordRef}
                  label={copy.password}
                  type="password"
                  name="password"
                  autoComplete="current-password"
                  value={password}
                  readOnly={pending}
                  error={passwordError ?? undefined}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setPasswordError(null);
                  }}
                />
              ) : null}
              {options.typeToConfirm !== undefined ? (
                <TextField
                  ref={typedRef}
                  label={copy.typeToConfirm(options.typeToConfirm)}
                  name="confirm"
                  autoComplete="off"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  value={typed}
                  readOnly={pending}
                  onChange={(e) => setTyped(e.target.value)}
                />
              ) : null}
            </form>
          ) : null}
          {error ? (
            <p role="alert" className="m-0 text-body-sm text-danger">
              {error}
            </p>
          ) : null}
        </>
      ) : null}
    </ModalDialog>
  );
}
