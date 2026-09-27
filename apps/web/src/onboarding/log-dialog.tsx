// "View full log" for a failed container runtime install (US-ONB-06): scrollable, with Copy.
import { Button, ModalDialog } from '@hlabs/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { onboardingCopy } from '../copy/onboarding';
import { useTRPC } from '../lib/trpc';

const copy = onboardingCopy.system;

export function LogDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const trpc = useTRPC();
  const log = useQuery({
    ...trpc.onboarding.checkSystem.queryOptions({ includeLog: true }),
    enabled: open,
    staleTime: 0,
  });
  const text = log.data?.engine.install?.log ?? '';
  const [copied, setCopied] = useState(false);

  return (
    <ModalDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setCopied(false);
        onOpenChange(next);
      }}
      title={copy.logTitle}
      width="min(720px, calc(100vw - 32px))"
      actions={
        <>
          <Button
            variant="secondary"
            disabled={!text}
            onClick={() => void navigator.clipboard.writeText(text).then(() => setCopied(true))}
          >
            {copied ? copy.copied : copy.copy}
          </Button>
          <Button onClick={() => onOpenChange(false)}>{copy.close}</Button>
        </>
      }
    >
      <pre
        tabIndex={0}
        aria-label={copy.logTitle}
        className="m-0 max-h-96 overflow-auto rounded-sm bg-surface-input p-3 font-mono text-mono whitespace-pre-wrap"
      >
        {log.isPending ? '…' : text || copy.logEmpty}
      </pre>
    </ModalDialog>
  );
}
