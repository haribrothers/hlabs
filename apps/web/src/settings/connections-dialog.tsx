// What hlabs connects to (US-SYS-29, 07 §7.1): every outside service hlabs talks to, its host, why and when it was
// last contacted, "Off" for one that is set up but not in use, and that hlabs sends no usage data or crash reports.
import { Badge, Button, List, ListRow, ModalDialog } from '@hlabs/ui';
import { useQuery } from '@tanstack/react-query';
import { advancedCopy as copy } from '../copy/advanced';
import { timeAgo } from '../lib/relative-time';
import { useTRPC } from '../lib/trpc';
import { useNow } from '../lib/use-now';

export function ConnectionsDialog({ onClose }: { onClose: () => void }) {
  const trpc = useTRPC();
  const now = useNow().getTime();
  const list = useQuery({ ...trpc.system.connections.queryOptions(), retry: false });
  return (
    <ModalDialog
      open
      onOpenChange={(open) => (open ? null : onClose())}
      sheetOnPhone
      width={600}
      title={copy.connectionsTitle}
      description={copy.connectionsIntro}
      actions={
        <Button variant="secondary" onClick={onClose}>
          {copy.close}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="m-0 text-body font-semibold text-ink">{copy.noTelemetry}</p>
        {list.isError ? (
          <p role="alert" className="m-0 text-body-sm text-danger">
            {copy.loadFailed}
          </p>
        ) : list.data ? (
          <List>
            {list.data.connections.map((c) => (
              <ListRow
                key={c.id}
                title={
                  <>
                    {c.name ?? copy.kindName[c.kind]}
                    <span className="block font-mono text-caption break-all text-ink-muted">{c.host}</span>
                  </>
                }
                subtitle={`${copy.why[c.kind]} · ${
                  c.lastContactAt === null ? copy.neverContacted : copy.lastContact(timeAgo(c.lastContactAt, now))
                }`}
                trailing={c.state === 'off' ? <Badge tone="neutral">{copy.off}</Badge> : null}
              />
            ))}
          </List>
        ) : (
          <div role="status" aria-label={copy.connectionsTitle} className="hl-skeleton h-24 w-full rounded-md" />
        )}
      </div>
    </ModalDialog>
  );
}
