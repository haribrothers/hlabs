// App settings › Configuration (US-APP-13…16, AppConfig). "Environment variables": each as a Name and a Value, the
// manifest's settings with the control for their type (their names read only, not removable), secrets masked with a
// "secret" badge until revealed (audited), generated ones revealed and copied but never edited, hidden ones under
// "Show advanced", and "+ Add variable" for more. "Network": the web address and the port on this computer. Cancel puts
// back what's saved; "Save and restart app" applies it all in one step and says how it went (US-APP-16).
import type { AppConfig, AppDetail } from '@hlabs/api';
import { ENV_NAME_PATTERN, isReservedEnvName } from '@hlabs/shared';
import { Copy, Eye, EyeOff, iconDefaults, Minus } from '@hlabs/icons';
import { HOSTNAME_PATTERN, RESERVED_APP_HOSTNAMES, tailnetAppPort } from '@hlabs/shared';
import { Badge, Button, IconButton, List, ListRow, Segmented, Switch, TextField } from '@hlabs/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { appConfigCopy } from '../copy/app-config';
import { codeLine, errorData, errorLine } from '../lib/error-copy';
import { useTRPC, useTRPCClient } from '../lib/trpc';
import { showToast } from '../lib/toasts';
import { useSettingsSave } from './use-settings-save';

const copy = appConfigCopy;
type Entry = AppConfig['env'][number];
/** A select with this many options or fewer is a Segmented; more, a menu (US-APP-13). */
const SEGMENTED_MAX = 3;
const PORT_MIN = 12000;
const PORT_MAX = 12999;

interface Row {
  id: number;
  key: string;
  /** Typed; for a secret, '' keeps it as it is. */
  value: string;
  secret: boolean;
  prompt: Entry['prompt'];
  generated: boolean;
  /** From the saved settings (not added in this edit). */
  saved: boolean;
  /** Its name as saved, for a secret whose value stays behind it. */
  savedKey: string | null;
  /** A secret's value once revealed: shown until hidden or the tab closes; not a change on its own. */
  revealed: string | null;
}

interface Form {
  rows: Row[];
  hostname: string;
  port: string;
}

let nextId = 1;
const toRows = (env: Entry[]): Row[] =>
  env.map((e) => ({
    id: nextId++,
    key: e.key,
    value: e.secret ? '' : (e.value ?? ''),
    secret: e.secret,
    prompt: e.prompt,
    generated: e.generated,
    saved: true,
    savedKey: e.key,
    revealed: null,
  }));
const toForm = (config: AppConfig): Form => ({
  rows: toRows(config.env),
  hostname: config.address.hostname,
  port: config.port.hostPort === null ? '' : String(config.port.hostPort),
});

/** What a form sends: comparing two says whether anything changed. */
function payload(form: Form, config: AppConfig) {
  const env = form.rows.map((r) => ({
    key: r.key,
    ...(r.secret && (r.value === '' || r.value === r.revealed) ? {} : { value: r.value }),
    secret: r.secret,
  }));
  const port = form.port.trim() === '' ? null : Number(form.port);
  return {
    env,
    ...(form.hostname !== config.address.hostname ? { hostname: form.hostname } : {}),
    ...(port !== null && port !== config.port.hostPort ? { hostPort: port } : {}),
  };
}

/** Each row's problem, by id; the address's and the port's. */
function problems(form: Form, config: AppConfig) {
  const rows = new Map<number, { name?: string; value?: string }>();
  const counts = new Map<string, number>();
  for (const r of form.rows) counts.set(r.key, (counts.get(r.key) ?? 0) + 1);
  for (const r of form.rows) {
    const p: { name?: string; value?: string } = {};
    if (!r.prompt) {
      if (r.key === '') p.name = copy.nameRequired;
      else if (!ENV_NAME_PATTERN.test(r.key)) p.name = copy.nameInvalid;
      else if (isReservedEnvName(r.key)) p.name = copy.nameReserved;
    }
    if (!p.name && r.key !== '' && (counts.get(r.key) ?? 0) > 1) p.name = copy.nameDuplicate;
    const type = r.prompt?.type;
    if (type === 'number' && r.value.trim() !== '' && !Number.isFinite(Number(r.value))) p.value = copy.enterNumber;
    else if (r.prompt?.required && !r.secret && r.value.trim() === '') p.value = copy.required;
    // A new secret, or one renamed, has nothing kept behind it.
    else if (r.secret && r.value === '' && (!r.saved || r.savedKey !== r.key)) p.value = copy.required;
    if (p.name || p.value) rows.set(r.id, p);
  }
  let address: string | null = null;
  if (form.hostname !== config.address.hostname) {
    if (!HOSTNAME_PATTERN.test(form.hostname)) address = copy.addressInvalid;
    else if ((RESERVED_APP_HOSTNAMES as readonly string[]).includes(form.hostname)) address = copy.addressReserved;
    else if (config.address.taken.includes(form.hostname)) address = copy.addressTaken;
  }
  let port: string | null = null;
  const text = form.port.trim();
  if (text !== '' && text !== String(config.port.hostPort)) {
    const n = Number(text);
    if (!/^\d+$/.test(text) || n < PORT_MIN || n > PORT_MAX) port = copy.portRange;
    else if (config.port.taken.includes(n)) port = copy.portTaken(n);
  }
  return { rows, address, port };
}

/** Where a refused save's reason goes: the address, the port, a variable's row, or a line under the form. */
function placeRefusal(err: unknown, port: string) {
  const data = errorData(err);
  const detail = (data?.detail ?? {}) as { key?: string; reason?: string; port?: number };
  switch (data?.hlabsCode) {
    case 'HOSTNAME_TAKEN':
      return { address: copy.addressTaken };
    case 'APP_PORT_IN_USE':
      return { port: copy.portTaken(detail.port ?? Number(port)) };
    case 'APP_ENV_INVALID':
      return { rowKey: detail.key, rowError: detail.reason === 'number' ? copy.enterNumber : copy.required };
    case 'VALIDATION_FAILED':
      if (detail.key)
        return { rowKey: detail.key, rowError: detail.reason === 'reserved' ? copy.nameReserved : copy.nameInvalid };
      if (detail.port) return { port: copy.portRange };
      return { line: errorLine(err) };
    default:
      return { line: errorLine(err) };
  }
}

/** The saved settings as the form sends them: new ones (after a save) start the form again. */
const savedKey = (config: AppConfig) => JSON.stringify(payload(toForm(config), config));

export function AppConfigPanel({ app, onDirtyChange }: { app: AppDetail; onDirtyChange: (dirty: boolean) => void }) {
  const trpc = useTRPC();
  const query = useQuery({ ...trpc.apps.getConfig.queryOptions({ appId: app.id }), retry: false });
  if (query.isError) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p role="alert" className="m-0 text-body-sm text-danger">
          {copy.loadFailed}
        </p>
        <Button variant="secondary" size="sm" onClick={() => void query.refetch()}>
          {copy.tryAgain}
        </Button>
      </div>
    );
  }
  if (!query.data) return <p className="m-0 text-body-sm text-ink-muted">{copy.loading}</p>;
  return <ConfigForm key={savedKey(query.data)} app={app} config={query.data} onDirtyChange={onDirtyChange} />;
}

function ConfigForm({
  app,
  config,
  onDirtyChange,
}: {
  app: AppDetail;
  config: AppConfig;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const client = useTRPCClient();
  const [form, setForm] = useState<Form>(() => toForm(config));
  const [advanced, setAdvanced] = useState(false);
  /** Errors from the last save, placed on their fields. */
  const [saveError, setSaveError] = useState<{
    address?: string;
    port?: string;
    line?: string;
    rowKey?: string;
    rowError?: string;
  } | null>(null);
  const focusNew = useRef<number | null>(null);
  const initial = useMemo(() => savedKey(config), [config]);
  const body = payload(form, config);
  const dirty = JSON.stringify(body) !== initial;
  const found = problems(form, config);
  const valid = found.rows.size === 0 && !found.address && !found.port;

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(
    () => () => {
      onDirtyChange(false);
    },
    [onDirtyChange],
  );

  const saving = useSettingsSave(
    app,
    (input: typeof body) => client.apps.setConfig.mutate({ appId: app.id, ...input }),
    {
      movedTo: () => (body.hostname ? `https://${body.hostname}.${config.address.domain}` : null),
      onDone: ({ failed }) => {
        if (failed === null) return setSaveError(null);
        if (failed === 'APP_PORT_IN_USE') return setSaveError({ port: copy.portTaken(Number(form.port)) });
        setSaveError({
          line: failed === 'APP_CONFIG_UNDONE' ? copy.undone(app.name) : codeLine(failed, { app: app.name }),
        });
      },
      // A refused save says why on the field it's about.
      onRefused: (err) => setSaveError(placeRefusal(err, form.port)),
    },
  );

  useEffect(() => {
    if (focusNew.current === null) return;
    document.getElementById(`env-name-${focusNew.current}`)?.focus();
    focusNew.current = null;
  });

  const update = (id: number, change: Partial<Row>) => {
    setSaveError(null);
    setForm((f) => ({ ...f, rows: f.rows.map((r) => (r.id === id ? { ...r, ...change } : r)) }));
  };
  const add = () => {
    const id = nextId++;
    focusNew.current = id;
    setForm((f) => ({
      ...f,
      rows: [
        ...f.rows,
        {
          id,
          key: '',
          value: '',
          secret: false,
          prompt: null,
          generated: false,
          saved: false,
          savedKey: null,
          revealed: null,
        },
      ],
    }));
  };
  const remove = (id: number) => setForm((f) => ({ ...f, rows: f.rows.filter((r) => r.id !== id) }));
  const cancel = () => {
    setSaveError(null);
    saving.reset();
    setForm(toForm(config));
  };

  const hidden = form.rows.filter((r) => r.prompt?.hidden);
  const shown = form.rows.filter((r) => !r.prompt?.hidden || advanced);
  const portNumber = Number(form.port.trim() === '' ? config.port.hostPort : form.port);
  const tailnet =
    config.port.tailnetHost && Number.isInteger(portNumber) && portNumber >= PORT_MIN && portNumber <= PORT_MAX
      ? `https://${config.port.tailnetHost}:${tailnetAppPort(portNumber)}`
      : null;

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (dirty && valid && !saving.busy) saving.save(body);
      }}
    >
      <List label={copy.envTitle}>
        {shown.map((row) => (
          <EnvRow
            key={row.id}
            row={row}
            problem={{
              ...found.rows.get(row.id),
              ...(saveError?.rowKey === row.key ? { value: saveError.rowError } : {}),
            }}
            onChange={(change) => update(row.id, change)}
            onRemove={() => remove(row.id)}
            reveal={(key) => client.apps.revealSecret.mutate({ appId: app.id, key })}
          />
        ))}
        <div className="hl-list-row flex-wrap">
          <Button type="button" variant="secondary" size="sm" onClick={add}>
            {copy.addVariable}
          </Button>
          <span className="text-body-sm text-ink-muted">{copy.prefilled}</span>
          {hidden.length ? (
            <Button
              type="button"
              variant="link"
              className="ml-auto"
              onClick={() => setAdvanced((a) => !a)}
              aria-expanded={advanced}
            >
              {advanced ? copy.hideAdvanced : copy.showAdvanced}
            </Button>
          ) : null}
        </div>
      </List>

      <List label={copy.network}>
        <ListRow
          title={copy.webAddress}
          subtitle={copy.addressHint}
          trailing={
            <TextField
              className="w-56"
              label={<span className="sr-only">{copy.subdomain}</span>}
              value={form.hostname}
              suffix={`.${config.address.domain}`}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              error={found.address ?? saveError?.address}
              onChange={(e) => {
                setSaveError(null);
                setForm((f) => ({ ...f, hostname: e.target.value.trim().toLowerCase() }));
              }}
            />
          }
        />
        <ListRow
          title={copy.port}
          subtitle={copy.listensOn(config.port.containerPort)}
          trailing={
            <TextField
              className="w-36"
              label={<span className="sr-only">{copy.hostPort}</span>}
              value={form.port}
              placeholder={copy.auto}
              inputMode="numeric"
              hint={tailnet ? copy.onTailnet(tailnet) : undefined}
              error={found.port ?? saveError?.port}
              onChange={(e) => {
                setSaveError(null);
                setForm((f) => ({ ...f, port: e.target.value }));
              }}
            />
          }
        />
      </List>

      {saveError?.line ? (
        <p role="alert" className="m-0 text-body-sm text-danger">
          {saveError.line}
        </p>
      ) : null}
      <footer className="flex items-center justify-end gap-3">
        <Button type="button" variant="secondary" disabled={!dirty || saving.busy} onClick={cancel}>
          {copy.cancel}
        </Button>
        <Button type="submit" disabled={!dirty || !valid || saving.busy} busy={saving.busy}>
          {saving.busy ? copy.saving : copy.save}
        </Button>
      </footer>
    </form>
  );
}

/** One variable: its name and value, and the controls its kind has. */
function EnvRow({
  row,
  problem,
  onChange,
  onRemove,
  reveal,
}: {
  row: Row;
  problem: { name?: string; value?: string };
  onChange: (change: Partial<Row>) => void;
  onRemove: () => void;
  reveal: (key: string) => Promise<{ value: string }>;
}) {
  // A revealed value shows until hidden or the tab closes (the form goes).
  const revealed = row.revealed;
  const revealing = useMutation({
    mutationFn: () => reveal(row.savedKey ?? row.key),
    meta: { inlineErrors: true },
    onSuccess: ({ value }) =>
      onChange(!row.generated && row.value === '' ? { value, revealed: value } : { revealed: value }),
    onError: () => showToast({ tone: 'danger', title: copy.revealFailed }),
  });
  const canReveal = row.secret && row.saved && row.savedKey === row.key;
  const hide = () => onChange(row.value === revealed ? { value: '', revealed: null } : { revealed: null });
  const copyIt = async () => {
    const value = revealed ?? (await revealing.mutateAsync()).value;
    await navigator.clipboard.writeText(value).then(
      () => showToast({ tone: 'success', title: copy.copied(row.key) }),
      () => showToast({ tone: 'danger', title: copy.copyFailed }),
    );
  };
  const type = row.prompt?.type;
  const name = (
    <TextField
      id={`env-name-${row.id}`}
      className="min-w-0 flex-1"
      label={<span className="sr-only">{copy.nameOf(row.key)}</span>}
      value={row.key}
      readOnly={!!row.prompt}
      placeholder={copy.name}
      autoCapitalize="characters"
      autoCorrect="off"
      spellCheck={false}
      error={problem.name}
      onChange={(e) => onChange({ key: e.target.value.toUpperCase() })}
    />
  );
  const valueLabel = <span className="sr-only">{copy.valueOf(row.key)}</span>;
  let value;
  if (type === 'boolean') {
    value = (
      <div className="flex min-w-0 flex-1 items-center">
        <Switch
          aria-label={copy.valueOf(row.key)}
          checked={row.value === 'true'}
          onChange={(on) => onChange({ value: String(on) })}
        />
      </div>
    );
  } else if (type === 'select' && row.prompt?.options && row.prompt.options.length <= SEGMENTED_MAX) {
    value = (
      <div className="flex min-w-0 flex-1 items-center">
        <Segmented
          aria-label={copy.valueOf(row.key)}
          value={row.value}
          onChange={(v) => onChange({ value: v })}
          options={row.prompt.options.map((o) => ({ value: o, label: o }))}
        />
      </div>
    );
  } else if (type === 'select' && row.prompt?.options) {
    value = (
      <label className="hl-field min-w-0 flex-1">
        {valueLabel}
        <select className="hl-input" value={row.value} onChange={(e) => onChange({ value: e.target.value })}>
          {row.prompt.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </label>
    );
  } else {
    const shownValue = row.generated ? (revealed ?? '') : row.value;
    value = (
      <TextField
        className="min-w-0 flex-1 font-mono"
        label={valueLabel}
        value={shownValue}
        readOnly={row.generated}
        type={row.secret && revealed === null ? 'password' : 'text'}
        inputMode={type === 'number' ? 'numeric' : undefined}
        placeholder={row.secret && canReveal ? copy.masked : copy.value}
        hint={
          row.generated ? copy.generated : row.secret && canReveal && revealed === null ? copy.keepSecret : undefined
        }
        error={problem.value}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => onChange({ value: e.target.value })}
        trailing={
          canReveal ? (
            <span className="flex items-center gap-1">
              <IconButton
                type="button"
                label={revealed === null ? copy.reveal(row.key) : copy.hide(row.key)}
                className="size-8"
                disabled={revealing.isPending}
                onClick={() => (revealed === null ? revealing.mutate() : hide())}
              >
                {revealed === null ? (
                  <Eye aria-hidden {...iconDefaults} className="size-4" />
                ) : (
                  <EyeOff aria-hidden {...iconDefaults} className="size-4" />
                )}
              </IconButton>
              {row.generated ? (
                <IconButton
                  type="button"
                  label={copy.copyValue(row.key)}
                  className="size-8"
                  onClick={() => void copyIt()}
                >
                  <Copy aria-hidden {...iconDefaults} className="size-4" />
                </IconButton>
              ) : null}
            </span>
          ) : undefined
        }
      />
    );
  }
  const end = row.prompt ? (
    row.secret ? (
      <Badge>{copy.secretBadge}</Badge>
    ) : (
      <IconButton type="button" label={copy.removeVariableOf(row.key)} disabled className="rounded-pill">
        <Minus aria-hidden {...iconDefaults} className="size-4" />
      </IconButton>
    )
  ) : (
    <span className="flex items-center gap-2">
      {row.saved && row.secret ? <Badge>{copy.secretBadge}</Badge> : null}
      <span className="flex items-center gap-1.5 text-body-sm text-ink-muted">
        <Switch
          aria-label={copy.secretToggleOf(row.key)}
          checked={row.secret}
          onChange={(on) => onChange({ secret: on })}
        />
        <span aria-hidden>{copy.secretToggle}</span>
      </span>
      <IconButton type="button" label={copy.removeVariableOf(row.key)} className="rounded-pill" onClick={onRemove}>
        <Minus aria-hidden {...iconDefaults} className="size-4" />
      </IconButton>
    </span>
  );
  return (
    <div className="hl-list-row flex-wrap !items-start md:flex-nowrap">
      {name}
      {value}
      <div className="flex min-h-11 items-center">{end}</div>
    </div>
  );
}
