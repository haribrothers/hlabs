// App settings › Permissions (US-APP-17, US-APP-18, US-APP-19, AppPermissions). "Folders": each folder the app can
// reach, as a breadcrumb with its mode and the manifest's label, a switch for its access (a required one stays on)
// and "Change…"; "+ Give access to a folder" opens the folder picker from Files, then asks Read only or Read and write
// (mounted at /mnt/hlabs/<folder-name>). "Devices" lists what it asked for, read only. "Network": "Reach the internet"
// and "Talk to other apps". Cancel puts back what's saved; "Save and restart app" applies folders and network
// together, with one restart, undone when the app doesn't start (US-APP-16).
import type { AppConfig, AppDetail } from '@hlabs/api';
import { AlertTriangle, iconDefaults } from '@hlabs/icons';
import { Button, List, ListRow, ModalDialog, Segmented, Switch } from '@hlabs/ui';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { appConfigCopy } from '../copy/app-config';
import { FolderPicker, type ChosenFolder } from '../files/folder-picker';
import { codeLine, errorLine } from '../lib/error-copy';
import { useTRPC, useTRPCClient } from '../lib/trpc';
import { useSettingsSave } from './use-settings-save';
import { HomeOnly } from '../public/home-only';

const copy = appConfigCopy;
const EXTRA_ROOT = '/mnt/hlabs';
type Mode = 'ro' | 'rw';
type Place = AppConfig['folders'][number]['place'];

interface FolderRow {
  id: number;
  target: string;
  /** Null for a manifest folder not given yet. */
  storageLocationId: string | null;
  subpath: string;
  mode: Mode;
  label: string;
  filesPath: string;
  available: boolean;
  folder: AppConfig['folders'][number]['folder'];
  /** Its access: off takes it away on save. */
  on: boolean;
}

interface Form {
  folders: FolderRow[];
  internet: boolean;
  apps: boolean;
}

/** "Home › Documents", "Shared › Media", "NAS › Backups". */
export function placeLabel(place: Place): string {
  const area = { home: copy.home, shared: copy.shared, appdata: copy.appData, location: place.locationName ?? '' }[
    place.area
  ];
  return copy.place([area, ...place.path.split('/')]);
}

let nextId = 1;
function toForm(config: AppConfig): Form {
  return {
    folders: [
      ...config.folders.map((f) => ({
        id: nextId++,
        target: f.target,
        storageLocationId: f.storageLocationId,
        subpath: f.subpath,
        mode: f.mode,
        label: placeLabel(f.place),
        filesPath: f.filesPath,
        available: f.available,
        folder: f.folder,
        on: true,
      })),
      ...config.folderRequests.map((r) => ({
        id: nextId++,
        target: r.key,
        storageLocationId: null,
        subpath: '',
        mode: r.mode,
        label: r.label,
        filesPath: '/home',
        available: true,
        folder: { key: r.key, label: r.label, description: r.description, required: false, mode: r.mode },
        on: false,
      })),
    ],
    internet: config.network.internet,
    apps: config.network.apps,
  };
}

function payload(form: Form) {
  return {
    mounts: form.folders
      .filter((f) => f.on && f.storageLocationId !== null)
      .map((f) => ({ target: f.target, storageLocationId: f.storageLocationId!, subpath: f.subpath, mode: f.mode })),
    network: { internet: form.internet, apps: form.apps },
  };
}

/** `/mnt/hlabs/<folder-name>`, with a number when another folder has the name. */
export function extraTarget(name: string, taken: readonly string[]): string {
  const base = name.replace(/[/\\:]/g, '-').slice(0, 70) || 'folder';
  for (let i = 1; ; i++) {
    const target = `${EXTRA_ROOT}/${i === 1 ? base : `${base}-${i}`}`;
    if (!taken.includes(target)) return target;
  }
}

export function AppPermissionsPanel({
  app,
  onDirtyChange,
}: {
  app: AppDetail;
  onDirtyChange: (dirty: boolean) => void;
}) {
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
  // Saved settings that changed (after a save) start the form again.
  return (
    <PermissionsForm
      key={JSON.stringify(payload(toForm(query.data)))}
      app={app}
      config={query.data}
      onDirtyChange={onDirtyChange}
    />
  );
}

type Picking = { kind: 'add' } | { kind: 'row'; id: number };

function PermissionsForm({
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
  const [picking, setPicking] = useState<Picking | null>(null);
  const [choosing, setChoosing] = useState<{ picking: Picking; chosen: ChosenFolder; mode: Mode } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const initial = useMemo(() => JSON.stringify(payload(toForm(config))), [config]);
  const body = payload(form);
  const dirty = JSON.stringify(body) !== initial;

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
    (input: typeof body) => client.apps.setPermissions.mutate({ appId: app.id, ...input }),
    {
      onDone: ({ failed }) =>
        setFailure(
          failed === null
            ? null
            : failed === 'APP_CONFIG_UNDONE'
              ? copy.undone(app.name)
              : codeLine(failed, { app: app.name }),
        ),
      onRefused: (err) => setFailure(errorLine(err)),
    },
  );

  const change = (id: number, next: Partial<FolderRow>) => {
    setFailure(null);
    setForm((f) => ({ ...f, folders: f.folders.map((r) => (r.id === id ? { ...r, ...next } : r)) }));
  };
  const pickingRow = picking?.kind === 'row' ? form.folders.find((r) => r.id === picking.id) : undefined;
  const choose = () => {
    if (!choosing) return;
    const { chosen, mode } = choosing;
    const where = {
      storageLocationId: chosen.storageLocationId,
      subpath: chosen.subpath,
      label: chosen.label,
      filesPath: chosen.path,
      available: true,
    };
    if (choosing.picking.kind === 'row') {
      change(choosing.picking.id, { ...where, mode, on: true });
    } else {
      const name = chosen.subpath.split('/').filter(Boolean).at(-1) ?? chosen.label.split(' › ').at(-1) ?? '';
      const target = extraTarget(
        name,
        form.folders.map((f) => f.target),
      );
      setFailure(null);
      setForm((f) => ({
        ...f,
        folders: [...f.folders, { id: nextId++, target, mode, folder: null, on: true, ...where }],
      }));
    }
    setChoosing(null);
  };
  const choosingFolder =
    choosing?.picking.kind === 'row'
      ? form.folders.find((r) => r.id === (choosing.picking as { id: number }).id)?.folder
      : null;
  const roOnly = choosingFolder?.mode === 'ro';

  const devices = config.devices;
  const anyDevice = devices.gpu || devices.list.length > 0 || devices.capabilities.length > 0;

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (dirty && !saving.busy) saving.save(body);
      }}
    >
      <p className="m-0 text-body-sm text-ink-muted">{copy.permissionsIntro}</p>

      <List label={copy.folders}>
        {form.folders.map((row) => {
          const required = !!row.folder?.required;
          const given = row.storageLocationId !== null;
          const subtitle = !row.available ? (
            <span className="inline-flex items-center gap-1 text-warning">
              <AlertTriangle aria-hidden {...iconDefaults} className="size-3.5" />
              {copy.notConnected}
            </span>
          ) : given ? (
            copy.folderLine(
              row.mode === 'ro' ? copy.readOnly : copy.readWrite,
              row.folder?.description ?? row.folder?.label ?? null,
            )
          ) : (
            copy.folderLine(copy.notGiven, row.folder?.description ?? null)
          );
          return (
            <ListRow
              key={row.id}
              title={given ? row.label : (row.folder?.label ?? row.label)}
              subtitle={subtitle}
              trailing={
                <span className="flex items-center gap-3">
                  {given ? (
                    <Button
                      type="button"
                      variant="link"
                      aria-label={copy.changeFolder(row.label)}
                      onClick={() => setPicking({ kind: 'row', id: row.id })}
                    >
                      {copy.change}
                    </Button>
                  ) : null}
                  <Switch
                    aria-label={copy.accessTo(given ? row.label : (row.folder?.label ?? row.label))}
                    checked={row.on}
                    disabled={required}
                    onChange={(on) => (on && !given ? setPicking({ kind: 'row', id: row.id }) : change(row.id, { on }))}
                  />
                </span>
              }
            />
          );
        })}
        {form.folders.some((r) => r.folder?.required) ? (
          <p className="hl-list-row m-0 text-body-sm text-ink-muted">{copy.requiredFolder(app.name)}</p>
        ) : null}
        <div className="hl-list-row">
          <Button type="button" variant="secondary" size="sm" onClick={() => setPicking({ kind: 'add' })}>
            {copy.giveAccess}
          </Button>
        </div>
      </List>

      <List label={copy.devices}>
        {anyDevice ? (
          <>
            {devices.list.map((d) => (
              <ListRow key={d.path} title={d.label} subtitle={<span className="font-mono">{d.path}</span>} />
            ))}
            {devices.gpu ? <ListRow title={copy.gpu} /> : null}
            {devices.capabilities.map((c) => (
              <ListRow key={c} title={copy.capability(c)} />
            ))}
            {devices.list.length ? (
              <p className="hl-list-row m-0 text-body-sm text-ink-muted">{copy.devicesNote}</p>
            ) : null}
          </>
        ) : (
          <p className="hl-list-row m-0 text-body-sm text-ink-muted">{copy.noDevices}</p>
        )}
      </List>

      <List label={copy.network}>
        <ListRow
          title={copy.reachInternet}
          subtitle={copy.internetReason(config.network.internetReason)}
          trailing={
            <Switch
              aria-label={copy.reachInternet}
              checked={form.internet}
              onChange={(internet) => {
                setFailure(null);
                setForm((f) => ({ ...f, internet }));
              }}
            />
          }
        />
        <ListRow
          title={copy.talkToApps}
          subtitle={copy.talkToAppsHint}
          trailing={
            <Switch
              aria-label={copy.talkToApps}
              checked={form.apps}
              onChange={(apps) => {
                setFailure(null);
                setForm((f) => ({ ...f, apps }));
              }}
            />
          }
        />
      </List>

      {config.auth.ownLogin ? (
        <List label={copy.signIn}>
          <ListRow title={copy.ownLogin} />
        </List>
      ) : null}

      {failure ? (
        <p role="alert" className="m-0 text-body-sm text-danger">
          {failure}
        </p>
      ) : null}
      <footer className="flex items-center justify-end gap-3">
        <Button
          type="button"
          variant="secondary"
          disabled={!dirty || saving.busy}
          onClick={() => {
            setFailure(null);
            saving.reset();
            setForm(toForm(config));
          }}
        >
          {copy.cancel}
        </Button>
        <HomeOnly procedure="apps.setPermissions" label={copy.save} size="md">
          <Button type="submit" disabled={!dirty || saving.busy} busy={saving.busy}>
            {saving.busy ? copy.saving : copy.save}
          </Button>
        </HomeOnly>
      </footer>

      {picking ? (
        <FolderPicker
          appName={app.name}
          folder={{
            label: pickingRow?.folder?.label ?? copy.folderAccess,
            mode: pickingRow?.folder?.mode === 'rw' ? 'rw' : 'ro',
          }}
          start={pickingRow?.filesPath ?? '/home'}
          onClose={() => setPicking(null)}
          onChoose={(chosen) => {
            const current = picking.kind === 'row' ? pickingRow : undefined;
            setChoosing({ picking, chosen, mode: current?.folder?.mode === 'ro' ? 'ro' : (current?.mode ?? 'ro') });
            setPicking(null);
          }}
        />
      ) : null}
      <ModalDialog
        open={choosing !== null}
        onOpenChange={(open) => (open ? undefined : setChoosing(null))}
        title={copy.folderAccess}
        description={choosing ? copy.folderAccessBody(app.name, choosing.chosen.label) : undefined}
        sheetOnPhone
        actions={
          <>
            <Button variant="secondary" onClick={() => setChoosing(null)}>
              {copy.cancel}
            </Button>
            <Button onClick={choose}>{choosing?.picking.kind === 'add' ? copy.add : copy.apply}</Button>
          </>
        }
      >
        {roOnly ? (
          <p className="m-0 text-body-sm text-ink-muted">{copy.roOnly}</p>
        ) : (
          <Segmented
            aria-label={copy.mode}
            value={choosing?.mode ?? 'ro'}
            onChange={(mode) => setChoosing((c) => (c ? { ...c, mode: mode as Mode } : c))}
            options={[
              { value: 'ro', label: copy.readOnly },
              { value: 'rw', label: copy.readWrite },
            ]}
          />
        )}
      </ModalDialog>
    </form>
  );
}
