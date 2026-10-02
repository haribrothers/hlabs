// The install sheet (US-STORE-08…10): what an app will be able to reach (folders), what runs and where it opens
// (includes, address, login), its settings, and "I understand" for risky access. A Dialog on desktop, a bottom sheet
// on a phone. Install starts the job and opens its progress page (US-STORE-11, US-STORE-12). Changing a folder's place
// needs the folder picker from Files (phase 5), so each folder uses its default until then (D-036).
import type { StoreAppDetails } from '@hlabs/api';
import { AlertTriangle, iconDefaults } from '@hlabs/icons';
import { HOSTNAME_PATTERN } from '@hlabs/shared';
import { Button, List, ListRow, ModalDialog, Segmented, Switch, TextField, tokens } from '@hlabs/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useMemo, useRef, useState } from 'react';
import { engineCopy } from '../copy/engine';
import { installCopy } from '../copy/install';
import { useEngineRunning } from '../lib/engine-state';
import { errorCode, errorData } from '../lib/error-copy';
import { useTRPC, useTRPCClient } from '../lib/trpc';
import { StoreLogo } from './cards';

const copy = installCopy;
const SHEET_LOGO = tokens.SIZE_DOCK_TILE - tokens.SPACE_1;

type Folder = StoreAppDetails['folders'][number];
type Prompt = StoreAppDetails['install']['env'][number];

/** "Home › Photos", "Shared › Media", "NAS › Photos archive", "App data › models". */
export function placeLabel(place: NonNullable<Folder['default']>['place']): string {
  const area = { home: copy.home, shared: copy.shared, appdata: copy.appData, location: place.locationName ?? '' }[
    place.area
  ];
  return copy.place([area, place.path]);
}

/** A folder's role in words: "Read and write · where your library is stored". */
const folderLine = (f: Folder) => {
  const what = f.description?.replace(/\.$/, '');
  return [copy.folderMode[f.mode], what && what.charAt(0).toLowerCase() + what.slice(1)].filter(Boolean).join(' · ');
};

/** A compose service name people can read: "immich-machine-learning" → "Immich machine learning". */
export const readableName = (name: string) => {
  const words = name.replace(/[-_]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/** "Immich server" · "web app"; "PostgreSQL" · "database · private to this app". */
export function includesRow(appName: string, s: StoreAppDetails['services'][number]) {
  const title = s.role === 'server' ? copy.server(appName) : (s.product ?? readableName(s.name));
  const role =
    s.role === 'server'
      ? copy.roleWeb
      : s.role === 'database'
        ? copy.roleDatabase
        : s.role === 'cache'
          ? copy.roleCache
          : copy.rolePrivate;
  return { title, role };
}

export function addressError(hostname: string, taken: readonly string[]): string | null {
  if (!HOSTNAME_PATTERN.test(hostname)) return copy.addressInvalid;
  if (taken.includes(hostname)) return copy.addressTaken;
  return null;
}

function PromptField({
  prompt,
  value,
  error,
  onChange,
  fieldRef,
}: {
  prompt: Prompt;
  value: string;
  error: string | null;
  onChange: (v: string) => void;
  fieldRef: (el: HTMLInputElement | null) => void;
}) {
  const [reveal, setReveal] = useState(false);
  if (prompt.type === 'boolean') {
    return (
      <ListRow
        title={prompt.label}
        subtitle={prompt.description ?? undefined}
        trailing={
          <Switch aria-label={prompt.label} checked={value === 'true'} onChange={(on) => onChange(String(on))} />
        }
      />
    );
  }
  if (prompt.type === 'select' && prompt.options) {
    return (
      <div className="flex flex-col gap-2 px-1">
        <span className="text-body-sm font-semibold">{prompt.label}</span>
        <Segmented
          aria-label={prompt.label}
          value={value}
          onChange={onChange}
          options={prompt.options.map((o) => ({ value: o, label: o }))}
        />
      </div>
    );
  }
  return (
    <TextField
      ref={fieldRef}
      label={prompt.label}
      hint={prompt.description ?? undefined}
      error={error ?? undefined}
      type={prompt.type === 'secret' && !reveal ? 'password' : prompt.type === 'number' ? 'number' : 'text'}
      inputMode={prompt.type === 'number' ? 'numeric' : undefined}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      trailing={
        prompt.type === 'secret' ? (
          <Button variant="link" type="button" onClick={() => setReveal((r) => !r)}>
            {reveal ? copy.hideSecret : copy.showSecret}
          </Button>
        ) : undefined
      }
    />
  );
}

export function InstallSheet({
  details,
  open,
  onOpenChange,
}: {
  details: StoreAppDetails;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { app, install } = details;
  const client = useTRPCClient();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Folders: required ones always on; optional ones on when they have a default place (US-STORE-08).
  const [enabled, setEnabled] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(details.folders.map((f) => [f.key, f.required || f.default !== null])),
  );
  const [hostname, setHostname] = useState(app.id);
  const [env, setEnv] = useState<Record<string, string>>(() =>
    Object.fromEntries(install.env.map((p) => [p.key, p.default ?? (p.type === 'boolean' ? 'false' : '')])),
  );
  const [envErrors, setEnvErrors] = useState<Record<string, string>>({});
  const [accepted, setAccepted] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const fields = useRef<Record<string, HTMLInputElement | null>>({});

  const address = details.address.replace(/^[^.]+/, '');
  const hostnameError = addressError(hostname, install.takenHostnames);
  const offline = details.folders.find((f) => enabled[f.key] && f.default && !f.default.available);
  const missing = details.folders.find((f) => f.required && !f.default);
  const risks = useMemo(
    () => [
      ...(details.access.dockerSocket ? [copy.riskDocker] : []),
      ...details.access.ports.map((p) => copy.riskPort(p.label, p.host)),
      ...(details.access.gpu ? [copy.riskGpu] : []),
    ],
    [details.access],
  );
  // Nothing installs without the engine (US-STATE-08).
  const engineDown = useEngineRunning() === false;
  const blocked = !!hostnameError || !!offline || !!missing || (install.risky && !accepted) || engineDown;

  const start = useMutation({
    mutationFn: () =>
      client.apps.install.mutate({
        appId: app.id,
        env,
        hostname,
        acceptRisks: accepted,
        mounts: details.folders
          .filter((f) => enabled[f.key] && f.default?.storageLocationId)
          .map((f) => ({
            target: f.key,
            storageLocationId: f.default!.storageLocationId!,
            subpath: f.default!.subpath,
            mode: f.mode,
          })),
      }),
    meta: { inlineErrors: true },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: trpc.apps.list.queryKey() });
      onOpenChange(false);
      void navigate({ to: '/store/install/$appId', params: { appId: app.id } });
    },
    onError: (err) => {
      const data = errorData(err);
      const key = data?.detail?.key;
      if (errorCode(err) === 'APP_ENV_INVALID' && typeof key === 'string') {
        setEnvErrors({ [key]: data?.detail?.reason === 'number' ? copy.number : copy.required });
        fields.current[key]?.focus();
      } else if (errorCode(err) === 'HOSTNAME_TAKEN') {
        setFailure(copy.addressTaken);
      } else {
        setFailure(copy.couldNotStart);
      }
    },
  });

  const submit = () => {
    setFailure(null);
    // Required settings first, with focus on the first empty one (US-STORE-10).
    const empty = install.env.find((p) => p.required && p.type !== 'boolean' && !env[p.key]?.trim());
    if (empty) {
      setEnvErrors({ [empty.key]: copy.required });
      fields.current[empty.key]?.focus();
      return;
    }
    setEnvErrors({});
    start.mutate();
  };

  return (
    <ModalDialog
      open={open}
      onOpenChange={onOpenChange}
      sheetOnPhone
      width="min(540px, 100%)"
      title={
        <span className="flex items-center gap-3">
          <StoreLogo app={app} size={SHEET_LOGO} />
          <span className="flex flex-col">
            <span className="text-title-2 font-bold">{copy.title(app.name)}</span>
            <span className="text-body-sm font-normal text-ink-muted">{copy.subtitle}</span>
          </span>
        </span>
      }
      actions={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {copy.cancel}
          </Button>
          {install.allowed ? (
            <Button
              disabled={blocked}
              busy={start.isPending}
              title={engineDown ? engineCopy.startFirst : undefined}
              onClick={submit}
            >
              {copy.install}
            </Button>
          ) : (
            <p className="m-0 self-center text-body-sm text-ink-muted">{copy.askAdmin}</p>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {details.folders.length ? (
          <List label={copy.folders}>
            {details.folders.map((f) => {
              const place = f.default ? placeLabel(f.default.place) : f.label;
              return (
                <ListRow
                  key={f.key}
                  title={place}
                  subtitle={
                    f.default && !f.default.available && enabled[f.key]
                      ? copy.offline(place)
                      : !f.default && f.required
                        ? copy.noDefault
                        : folderLine(f)
                  }
                  trailing={
                    <Switch
                      aria-label={copy.useFolder(place)}
                      checked={!!enabled[f.key]}
                      disabled={f.required || !f.default}
                      onChange={(on) => setEnabled((e) => ({ ...e, [f.key]: on }))}
                    />
                  }
                />
              );
            })}
          </List>
        ) : null}

        {details.services.length ? (
          <List label={copy.includes}>
            {details.services.map((s) => {
              const row = includesRow(app.name, s);
              return (
                <ListRow
                  key={s.name}
                  title={row.title}
                  trailing={<span className="text-body-sm text-ink-muted">{row.role}</span>}
                />
              );
            })}
          </List>
        ) : null}

        {/* The address as one row, as the InstallSheet screen draws it: only the hostname part is editable. */}
        <div className="flex flex-col gap-1.5">
          <List label={copy.address}>
            <ListRow
              title={
                <span className="flex min-w-0 flex-wrap items-center font-mono text-body-sm">
                  <span className="text-ink-muted">https://</span>
                  <input
                    aria-label={copy.addressLabel}
                    aria-invalid={hostnameError ? true : undefined}
                    aria-describedby={hostnameError ? 'install-address-msg' : undefined}
                    value={hostname}
                    // Monospace, so as wide as what's typed.
                    style={{ width: `${Math.max(hostname.length, 1)}ch` }}
                    onChange={(e) => setHostname(e.target.value.trim().toLowerCase())}
                    spellCheck={false}
                    autoCapitalize="off"
                    className="hl-focus shrink-0 rounded-xs border-0 bg-transparent p-0 font-mono text-body-sm text-ink underline decoration-dotted underline-offset-4"
                  />
                  <span className="text-ink-muted">{address}</span>
                </span>
              }
              // "Login required" beside the address, as the screen draws it; an app's own login is noted under it.
              subtitle={install.ownLogin ? copy.ownLoginToo : undefined}
              trailing={
                <span className="shrink-0 text-body-sm text-ink-muted">
                  {install.webAuth === 'hlabs' ? copy.loginRequired : copy.noLogin}
                </span>
              }
            />
          </List>
          {hostnameError ? (
            <p id="install-address-msg" aria-live="polite" className="m-0 text-body-sm text-danger">
              {hostnameError}
            </p>
          ) : null}
        </div>

        {install.env.length ? (
          <section aria-label={copy.settings} className="flex flex-col gap-3">
            <h3 className="m-0 text-body-sm font-bold">{copy.settings}</h3>
            {install.env.map((p) => (
              <PromptField
                key={p.key}
                prompt={p}
                value={env[p.key] ?? ''}
                error={envErrors[p.key] ?? null}
                onChange={(v) => {
                  setEnv((e) => ({ ...e, [p.key]: v }));
                  setEnvErrors((e) => ({ ...e, [p.key]: '' }));
                }}
                fieldRef={(el) => {
                  fields.current[p.key] = el;
                }}
              />
            ))}
          </section>
        ) : null}

        {install.risky ? (
          <section
            aria-label={copy.risks}
            className="flex flex-col gap-3 rounded-lg border border-danger bg-[color-mix(in_srgb,var(--danger)_14%,transparent)] p-4"
          >
            <p className="m-0 flex items-center gap-2 text-body font-bold text-danger">
              <AlertTriangle aria-hidden {...iconDefaults} className="size-4" />
              {copy.risks}
            </p>
            <ul className="m-0 flex flex-col gap-1 pl-5 text-body-sm">
              {risks.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
            <label className="flex min-h-11 items-center gap-3 text-body-sm font-semibold">
              <input
                type="checkbox"
                className="hl-focus size-5 accent-[var(--danger)]"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
              />
              {copy.understand}
            </label>
          </section>
        ) : null}

        {offline?.default ? (
          <p className="m-0 text-body-sm text-danger">{copy.offline(placeLabel(offline.default.place))}</p>
        ) : null}
        {failure ? (
          <p role="alert" className="m-0 text-body-sm text-danger">
            {failure}
          </p>
        ) : null}
      </div>
    </ModalDialog>
  );
}
