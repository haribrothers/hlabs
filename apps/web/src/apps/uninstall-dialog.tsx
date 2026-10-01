// "Uninstall <App>?" (US-APP-11): keep its data (the default) or delete it too, with how much that removes. An app
// another installed app needs can't be uninstalled first. Focus starts on Cancel; Esc and Cancel change nothing.
import type { AppDetail } from '@hlabs/api';
import { formatBytes } from '@hlabs/shared';
import { Button, ChoiceList, ModalDialog } from '@hlabs/ui';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useRef, useState } from 'react';
import { appsCopy } from '../copy/apps';
import { errorLine } from '../lib/error-copy';
import { useTRPCClient } from '../lib/trpc';

const copy = appsCopy;
type Choice = 'keep' | 'delete';

export function UninstallDialog({
  app,
  open,
  onOpenChange,
}: {
  app: AppDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const client = useTRPCClient();
  const navigate = useNavigate();
  const cancel = useRef<HTMLButtonElement>(null);
  const [choice, setChoice] = useState<Choice>('keep');
  const uninstall = useMutation({
    mutationFn: () => client.apps.uninstall.mutate({ appId: app.id, keepData: choice === 'keep' }),
    meta: { inlineErrors: true },
    // Home shows the app uninstalling until the job is done (US-APP-12).
    onSuccess: () => {
      onOpenChange(false);
      void navigate({ to: '/' });
    },
  });
  const [needs] = app.dependents;
  const size = app.disk ? formatBytes(app.disk.dataBytes) : null;
  const close = (next: boolean) => {
    if (!next) {
      setChoice('keep');
      uninstall.reset();
    }
    onOpenChange(next);
  };
  return (
    <ModalDialog
      open={open}
      onOpenChange={close}
      dismissible={!uninstall.isPending}
      role="alertdialog"
      title={copy.uninstallTitle(app.name)}
      description={copy.uninstallBody}
      initialFocus={cancel}
      sheetOnPhone
      actions={
        <>
          <Button ref={cancel} variant="secondary" disabled={uninstall.isPending} onClick={() => close(false)}>
            {copy.cancel}
          </Button>
          <Button
            variant="destructive"
            busy={uninstall.isPending}
            disabled={needs !== undefined || uninstall.isPending}
            onClick={() => uninstall.mutate()}
          >
            {choice === 'keep' ? copy.uninstall : copy.uninstallAndDelete}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <ChoiceList<Choice>
          label={copy.dataQuestion}
          value={choice}
          onChange={setChoice}
          options={[
            { value: 'keep', title: copy.keepData, subtitle: copy.keepDataNote },
            { value: 'delete', title: copy.deleteData, subtitle: copy.deleteDataNote(size) },
          ]}
        />
        {needs !== undefined ? <p className="m-0 text-body-sm text-danger">{copy.needsIt(needs, app.name)}</p> : null}
        {uninstall.error ? (
          <p role="alert" className="m-0 text-body-sm text-danger">
            {errorLine(uninstall.error)}
          </p>
        ) : null}
      </div>
    </ModalDialog>
  );
}
