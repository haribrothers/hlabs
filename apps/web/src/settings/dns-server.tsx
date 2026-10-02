// Settings › Network, Local DNS server (US-SYS-06): hlabs keeps its home.arpa and .local names in AdGuard Home on
// this computer or a Pi-hole anywhere, or lists the records to add by hand (D-105, D-106). The row warns when the
// server stopped answering; hlabs tries again on the next change and every 10 minutes.
import type { NetworkStatus } from '@hlabs/api';
import { Badge, Button, ChoiceList, ListRow, ModalDialog, TextField } from '@hlabs/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useId, useState, type FormEvent } from 'react';
import { networkCopy as copy } from '../copy/network';
import { errorCode, errorLine } from '../lib/error-copy';
import { showToast } from '../lib/toasts';
import { useTRPC, useTRPCClient } from '../lib/trpc';
import { useIsDesktop } from '../lib/use-media';

type Dns = NetworkStatus['dns'];
type Kind = Dns['kind'];

const SERVER_NAME: Record<Kind, string> = { none: '', adguard: 'AdGuard Home', pihole: 'Pi-hole', manual: '' };

/** "hlabs.home.arpa A 192.168.1.20", one per line: what Copy puts on the clipboard. */
export const recordLines = (records: Dns['records']) => records.map((r) => `${r.name} ${r.type} ${r.value}`).join('\n');

/** The warning on the row, or null when the last sync worked. */
export function dnsProblem(dns: Dns): string | null {
  if (dns.problem === 'auth') return copy.refusedPassword;
  if (dns.problem === 'unreachable') return copy.notAnswering(SERVER_NAME[dns.kind]);
  return null;
}

function chosenLine(dns: Dns): string {
  if (dns.kind === 'adguard') return copy.dnsAdguard;
  if (dns.kind === 'pihole') return copy.dnsPiholeAt(dns.address ?? '');
  if (dns.kind === 'manual') return copy.dnsManual;
  return copy.dnsHelper;
}

const isUrl = (value: string) => /^https?:\/\/[^\s/]+/.test(value.trim());

function copyRecords(records: Dns['records']) {
  navigator.clipboard.writeText(recordLines(records)).then(
    () => showToast({ tone: 'success', title: copy.recordsCopied }),
    () => showToast({ tone: 'danger', title: copy.copyFailed }),
  );
}

/** The rows under "Local DNS server": what's chosen, and for "Another DNS server" the records to add. */
export function DnsServerRows({ dns }: { dns: Dns }) {
  const [changing, setChanging] = useState(false);
  const desktop = useIsDesktop();
  const problem = dnsProblem(dns);
  const copyButton = dns.records.length ? (
    <Button variant="secondary" size={desktop ? 'sm' : 'md'} onClick={() => copyRecords(dns.records)}>
      {copy.copyRecords}
    </Button>
  ) : null;
  return (
    <>
      <ListRow
        title={copy.localDns}
        subtitle={chosenLine(dns)}
        trailing={
          <span className="flex items-center gap-2">
            {problem ? <Badge tone="warning">{problem}</Badge> : null}
            <Button variant="secondary" size="sm" aria-label={copy.changeDns} onClick={() => setChanging(true)}>
              {copy.change}
            </Button>
          </span>
        }
      />
      {dns.kind === 'manual' ? (
        <ListRow
          title={copy.records}
          subtitle={
            dns.records.length ? (
              <span className="flex flex-col gap-0.5">
                {dns.records.map((r) => (
                  <span key={r.name} className="font-mono break-words">
                    {`${r.name} · ${r.type} · ${r.value}`}
                  </span>
                ))}
                <span>{copy.recordsHint}</span>
              </span>
            ) : (
              copy.noRecords
            )
          }
          // On a phone the records keep the row's width and Copy goes underneath.
          trailing={desktop ? copyButton : undefined}
          below={desktop ? undefined : copyButton}
        />
      ) : null}
      {changing ? <DnsServerDialog dns={dns} onClose={() => setChanging(false)} /> : null}
    </>
  );
}

export function DnsServerDialog({ dns, onClose }: { dns: Dns; onClose: () => void }) {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();
  const formId = useId();
  const [kind, setKind] = useState<Kind>(dns.kind);
  const [address, setAddress] = useState(dns.address ?? '');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ address?: string; password?: string }>({});
  const [tested, setTested] = useState<'ok' | string | null>(null);
  // Saving Pi-hole at the same address may keep the password hlabs already has.
  const hasPassword = dns.kind === 'pihole' && address.trim() === dns.address;

  const check = (needPassword: boolean) => {
    const found: typeof errors = {};
    if (!isUrl(address)) found.address = copy.addressInvalid;
    if (needPassword && !password) found.password = copy.passwordNeeded;
    setErrors(found);
    return !found.address && !found.password;
  };

  const test = useMutation({
    mutationFn: () => client.network.testDnsServer.mutate({ address: address.trim(), appPassword: password }),
    meta: { inlineErrors: true },
    onMutate: () => setTested(null),
    onSuccess: () => setTested('ok'),
    onError: (err) => setTested(errorLine(err)),
  });

  const save = useMutation({
    mutationFn: () =>
      client.network.setDnsServer.mutate(
        kind === 'pihole'
          ? { kind, address: address.trim(), ...(password ? { appPassword: password } : {}) }
          : { kind },
      ),
    meta: { inlineErrors: true },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: trpc.network.status.queryKey() });
      showToast({ tone: 'success', title: copy.dnsSaved });
      onClose();
    },
    onError: (err) => {
      const code = errorCode(err);
      if (kind === 'pihole' && (code === 'DNS_SERVER_AUTH_FAILED' || code === 'DNS_SERVER_UNREACHABLE'))
        setTested(errorLine(err));
      else showToast({ tone: 'danger', title: errorLine(err) });
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (kind !== 'pihole' || check(!hasPassword)) save.mutate();
  };

  return (
    <ModalDialog
      open
      onOpenChange={(open) => (open ? null : onClose())}
      sheetOnPhone
      title={copy.localDns}
      description={copy.dnsHelper}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            {copy.cancel}
          </Button>
          <Button type="submit" form={formId} busy={save.isPending}>
            {copy.save}
          </Button>
        </>
      }
    >
      <form id={formId} noValidate onSubmit={submit} className="flex flex-col gap-4">
        <ChoiceList<Kind>
          label={copy.localDns}
          value={kind}
          onChange={setKind}
          options={[
            { value: 'none', title: copy.dnsNone },
            {
              value: 'adguard',
              title: copy.dnsAdguard,
              subtitle: dns.adguardInstalled ? copy.dnsAdguardHint : copy.dnsAdguardMissing,
              disabled: !dns.adguardInstalled,
            },
            { value: 'pihole', title: copy.dnsPihole, subtitle: copy.dnsPiholeHint },
            { value: 'manual', title: copy.dnsManual, subtitle: copy.dnsManualHint },
          ]}
        />
        {dns.adguardInstalled ? null : (
          <Link
            to="/store/app/$appId"
            params={{ appId: 'adguard-home' }}
            className="hl-focus self-start rounded-xs text-body-sm font-semibold text-accent-link no-underline"
          >
            {copy.dnsAdguardLink}
          </Link>
        )}
        {kind === 'pihole' ? (
          <>
            <TextField
              label={copy.piholeAddress}
              hint={copy.piholeAddressHint}
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              value={address}
              error={errors.address}
              onChange={(e) => {
                setAddress(e.target.value);
                setTested(null);
              }}
            />
            <TextField
              label={copy.piholePassword}
              hint={hasPassword ? copy.piholePasswordKept : copy.piholePasswordHint}
              type="password"
              autoComplete="off"
              value={password}
              error={errors.password}
              onChange={(e) => {
                setPassword(e.target.value);
                setTested(null);
              }}
            />
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="secondary"
                size="sm"
                busy={test.isPending}
                onClick={() => (check(true) ? test.mutate() : null)}
              >
                {copy.test}
              </Button>
              <span role="status" className="text-body-sm">
                {tested === 'ok' ? (
                  <span className="text-success">{copy.testOk}</span>
                ) : tested ? (
                  <span className="text-danger">{tested}</span>
                ) : null}
              </span>
            </div>
          </>
        ) : null}
        <button type="submit" hidden aria-hidden tabIndex={-1} />
      </form>
    </ModalDialog>
  );
}
