// "Reset hlabs to factory settings?" (FactoryReset, US-SYS-37): what is deleted and what isn't, "Keep everyone's Home
// folders" (off), the admin's password and the hostname typed exactly (07 §7.8). "Reset hlabs" stays disabled until
// both are there; a wrong password says so on its field. Once hlabs takes it, the page shows "Resetting hlabs…" and
// then opens setup (US-SYS-38).
import { isFeatureEnabled } from '@hlabs/shared';
import { iconDefaults, TriangleAlert } from '@hlabs/icons';
import { Button, ModalDialog, TextField } from '@hlabs/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useId, useRef, useState } from 'react';
import { advancedCopy as copy } from '../copy/advanced';
import { markResetting, setResetAsked } from '../health/restarting';
import { errorCode, errorLine } from '../lib/error-copy';
import { useTRPC, useTRPCClient } from '../lib/trpc';
import { useIsDesktop } from '../lib/use-media';
import { PasswordReveal } from '../shell/password-reveal';

/** "your NAS", "Backblaze and USB disk". */
const names = (list: string[]) =>
  list.length <= 1 ? (list[0] ?? '') : `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`;

export function FactoryResetDialog({
  hostname,
  onClose,
  shippedPhase,
}: {
  hostname: string;
  onClose: () => void;
  /** For tests of a phase that hasn't shipped yet. */
  shippedPhase?: number;
}) {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const desktop = useIsDesktop();
  const formId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [keepHomes, setKeepHomes] = useState(false);
  const [password, setPassword] = useState('');
  const [shown, setShown] = useState(false);
  const [typed, setTyped] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const apps = useQuery({ ...trpc.apps.list.queryOptions(), retry: false });
  const destinations = useQuery({
    ...trpc.backups.destinations.list.queryOptions(),
    retry: false,
    enabled: isFeatureEnabled('backups', shippedPhase),
  });
  const appCount = apps.data?.apps.length ?? 0;
  const backups = destinations.data?.destinations.map((d) => d.name) ?? [];

  const reset = useMutation({
    mutationFn: () => {
      setResetAsked(true);
      return client.system.factoryReset.mutate({ password, confirmHostname: typed, keepHomeFolders: keepHomes });
    },
    meta: { inlineErrors: true },
    onSuccess: ({ setupToken }) => markResetting(setupToken),
    onError: (err) => {
      setResetAsked(false);
      if (errorCode(err) === 'AUTH_INVALID_PASSWORD') {
        setPassword('');
        setPasswordError(copy.wrongPassword);
        passwordRef.current?.focus();
      }
    },
  });
  const ready = password.length > 0 && typed === hostname;
  const busy = reset.isPending || reset.isSuccess;
  const formError = reset.isError && errorCode(reset.error) !== 'AUTH_INVALID_PASSWORD' ? errorLine(reset.error) : null;

  const cancel = (
    <Button key="cancel" ref={cancelRef} variant="secondary" disabled={busy} onClick={onClose}>
      {copy.cancel}
    </Button>
  );
  const go = (
    <Button key="go" type="submit" form={formId} variant="destructive" disabled={!ready} busy={busy}>
      {copy.resetConfirm}
    </Button>
  );
  return (
    <ModalDialog
      open
      role="alertdialog"
      onOpenChange={(open) => (open || busy ? null : onClose())}
      dismissible={!busy}
      sheetOnPhone
      initialFocus={cancelRef}
      icon={
        <span className="hl-dialog-icon-danger">
          <TriangleAlert aria-hidden {...iconDefaults} className="size-6" />
        </span>
      }
      title={copy.resetTitle}
      actions={desktop ? [cancel, go] : [go, cancel]}
    >
      <form
        id={formId}
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready && !busy) reset.mutate();
        }}
      >
        <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-body text-ink">
          {appCount > 0 ? <li>{copy.resetApps(appCount)}</li> : null}
          <li>{copy.resetUsers}</li>
          {backups.length ? <li>{copy.resetBackups(names(backups))}</li> : null}
        </ul>
        <label className="flex min-h-11 items-center gap-3 text-body text-ink">
          <input
            type="checkbox"
            className="hl-focus size-4 accent-[var(--color-accent)]"
            checked={keepHomes}
            disabled={busy}
            onChange={(e) => setKeepHomes(e.target.checked)}
          />
          {copy.keepHomes}
        </label>
        <TextField
          ref={passwordRef}
          label={copy.password}
          type={shown ? 'text' : 'password'}
          name="password"
          autoComplete="current-password"
          value={password}
          readOnly={busy}
          error={passwordError ?? undefined}
          announce="polite"
          onChange={(e) => {
            setPassword(e.target.value);
            setPasswordError(null);
          }}
          trailing={<PasswordReveal shown={shown} onToggle={() => setShown(!shown)} />}
        />
        <TextField
          label={copy.typeHostname(hostname)}
          name="confirm"
          placeholder={hostname}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          value={typed}
          readOnly={busy}
          onChange={(e) => setTyped(e.target.value)}
        />
        {formError ? (
          <p role="alert" className="m-0 text-body-sm text-danger">
            {formError}
          </p>
        ) : null}
      </form>
    </ModalDialog>
  );
}
