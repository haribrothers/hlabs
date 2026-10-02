// Change web ports (US-SYS-05): new HTTPS and HTTP ports, checked free by hlabs before saving. The ports apps publish
// are listed so a change doesn't clash. After saving, this page moves to the new address.
import { Button, List, ListRow, ModalDialog, TextField } from '@hlabs/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState, type FormEvent } from 'react';
import { networkCopy as copy } from '../copy/network';
import { browser } from '../lib/browser';
import { errorCode, errorData } from '../lib/error-copy';
import { showToast } from '../lib/toasts';
import { useTRPC, useTRPCClient } from '../lib/trpc';

/** How long the page waits for the proxy to listen on the new port before moving there. */
const MOVE_AFTER_MS = 1_500;

const valid = (port: number, usual: number) =>
  Number.isInteger(port) && (port === usual || (port >= 1024 && port <= 65535 && (port < 12000 || port > 14999)));

/** This page at the new HTTPS port, or null when it isn't on HTTPS (development). */
export function addressAfterPortChange(location: Pick<Location, 'protocol' | 'hostname' | 'pathname'>, https: number) {
  if (location.protocol !== 'https:') return null;
  return `https://${location.hostname}${https === 443 ? '' : `:${https}`}${location.pathname}`;
}

export function WebPortsDialog({ onClose }: { onClose: () => void }) {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();
  const formId = useId();
  const ports = useQuery({ ...trpc.network.ports.queryOptions(), retry: false });
  const [https, setHttps] = useState<string | null>(null);
  const [http, setHttp] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ https?: string; http?: string }>({});
  const httpsValue = https ?? String(ports.data?.https ?? '');
  const httpValue = http ?? String(ports.data?.http ?? '');

  const save = useMutation({
    mutationFn: (next: { https: number; http: number }) => client.network.setPorts.mutate(next),
    meta: { inlineErrors: true },
    onSuccess: async (_ok, next) => {
      const address = addressAfterPortChange(window.location, next.https);
      if (address) {
        showToast({ tone: 'success', title: copy.movingTo(address) });
        setTimeout(() => browser.assign(address), MOVE_AFTER_MS);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: trpc.network.status.queryKey() });
      showToast({ tone: 'success', title: copy.portsSaved });
      onClose();
    },
    onError: (err, next) => {
      if (errorCode(err) === 'NETWORK_PORT_IN_USE') {
        const port = Number((errorData(err)?.detail as { port?: number } | undefined)?.port);
        setErrors(port === next.http ? { http: copy.portInUse(port) } : { https: copy.portInUse(port) });
      } else if (errorCode(err) === 'VALIDATION_FAILED') setErrors({ https: copy.portInvalid });
      else showToast({ tone: 'danger', title: copy.saveFailed });
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next = { https: Number(httpsValue), http: Number(httpValue) };
    const found: typeof errors = {};
    if (!valid(next.https, 443)) found.https = copy.portInvalid;
    if (!valid(next.http, 80)) found.http = copy.portInvalid;
    if (!found.https && !found.http && next.https === next.http) found.http = copy.portsSame;
    setErrors(found);
    if (!found.https && !found.http) save.mutate(next);
  };

  return (
    <ModalDialog
      open
      onOpenChange={(open) => (open ? null : onClose())}
      sheetOnPhone
      title={copy.changePortsTitle}
      description={copy.changePortsLead}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            {copy.cancel}
          </Button>
          <Button type="submit" form={formId} busy={save.isPending} disabled={!ports.data}>
            {copy.save}
          </Button>
        </>
      }
    >
      <form id={formId} noValidate onSubmit={submit} className="flex flex-col gap-4">
        <TextField
          label={copy.httpsPort}
          hint={copy.httpsPortHint}
          inputMode="numeric"
          value={httpsValue}
          error={errors.https}
          onChange={(e) => setHttps(e.target.value.replace(/\D/g, ''))}
        />
        <TextField
          label={copy.httpPort}
          hint={copy.httpPortHint}
          inputMode="numeric"
          value={httpValue}
          error={errors.http}
          onChange={(e) => setHttp(e.target.value.replace(/\D/g, ''))}
        />
        {ports.data?.appPorts.length ? (
          <List label={copy.appPortsTitle}>
            {ports.data.appPorts.map((p) => (
              <ListRow
                key={`${p.appId}-${p.port}-${p.protocol}`}
                title={<span className="font-mono">{p.port}</span>}
                subtitle={copy.appPortLine(p.appName, p.label, p.protocol)}
              />
            ))}
          </List>
        ) : null}
        <button type="submit" hidden aria-hidden tabIndex={-1} />
      </form>
    </ModalDialog>
  );
}
