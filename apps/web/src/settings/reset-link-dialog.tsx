// Reset password (US-ACCT-14): a one-time link for a member, made when the dialog opens. Making it again stops the
// earlier link. It's shown here only; nothing is emailed (there is no email).
import { Button, ModalDialog } from '@hlabs/ui';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { peopleCopy as copy } from '../copy/people';
import { showToast } from '../lib/toasts';
import { useTRPCClient } from '../lib/trpc';
import { HomeLink } from './home-link';

export function ResetLinkDialog({ userId, name, onClose }: { userId: string; name: string; onClose: () => void }) {
  const client = useTRPCClient();
  const started = useRef(false);
  const make = useMutation({ mutationFn: () => client.users.resetPasswordLink.mutate({ userId }) });
  useEffect(() => {
    // Once per dialog, even when React runs effects twice in development.
    if (started.current) return;
    started.current = true;
    make.mutate();
  }, [make]);

  const copyLink = () => {
    if (!make.data) return;
    navigator.clipboard.writeText(make.data.url).then(
      () => showToast({ tone: 'success', title: copy.linkCopied }),
      () => showToast({ tone: 'danger', title: copy.copyFailed }),
    );
  };

  return (
    <ModalDialog
      open
      onOpenChange={(open) => (open ? null : onClose())}
      width="min(540px, 100%)"
      sheetOnPhone
      title={copy.resetTitle(name)}
      description={copy.resetLead(name)}
      actions={<Button onClick={onClose}>{copy.done}</Button>}
    >
      <section aria-labelledby="reset-link-label" className="flex flex-col gap-2 rounded-md bg-surface-row p-4">
        <span id="reset-link-label" className="text-body-sm font-semibold text-ink">
          {copy.resetLink}
        </span>
        {make.isError ? (
          <div role="alert" className="flex items-center gap-3 text-body">
            <span>{copy.resetFailed}</span>
            <Button variant="secondary" size="sm" onClick={() => make.mutate()}>
              {copy.tryAgain}
            </Button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <input
                readOnly
                aria-labelledby="reset-link-label"
                value={make.data?.url ?? copy.creatingLink}
                onFocus={(e) => e.currentTarget.select()}
                className="hl-focus min-w-0 flex-1 rounded-sm bg-surface-input px-3 py-2.5 font-mono text-mono text-ink"
              />
              <Button variant="secondary" onClick={copyLink} disabled={!make.data}>
                {copy.copy}
              </Button>
            </div>
            {make.data?.homeUrl ? <HomeLink url={make.data.homeUrl} /> : null}
            <p className="m-0 text-body-sm text-ink-muted">{copy.resetNote}</p>
          </>
        )}
      </section>
    </ModalDialog>
  );
}
