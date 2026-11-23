// "Discard changes?" (US-APP-16): switching tabs or closing App settings with unsaved changes in Configuration or
// Permissions asks first. The panel says whether it has changes; `guard` runs an action now, or after "Discard".
import { Button, ModalDialog } from '@hlabs/ui';
import { useRef, useState } from 'react';
import { appConfigCopy } from '../copy/app-config';

const copy = appConfigCopy;

export function useDiscardGuard() {
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState<(() => void) | null>(null);
  const keep = useRef<HTMLButtonElement>(null);
  const guard = (action: () => void) => (dirty ? setPending(() => action) : action());
  const dialog = (
    <ModalDialog
      open={pending !== null}
      onOpenChange={(open) => (open ? undefined : setPending(null))}
      title={copy.discardTitle}
      description={copy.discardBody}
      initialFocus={keep}
      sheetOnPhone
      actions={
        <>
          <Button ref={keep} variant="secondary" onClick={() => setPending(null)}>
            {copy.keepEditing}
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              const action = pending;
              setPending(null);
              setDirty(false);
              action?.();
            }}
          >
            {copy.discard}
          </Button>
        </>
      }
    />
  );
  return { dirty, setDirty, guard, dialog };
}
