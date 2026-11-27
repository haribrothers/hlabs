// App settings › Configuration and Permissions in tests (US-APP-13…19): an app's settings as apps.getConfig returns
// them, and each panel rendered with a fake daemon.
import type { AppConfig, AppDetail } from '@hlabs/api';
import { AppConfigPanel } from '../apps/app-config';
import { AppPermissionsPanel } from '../apps/app-permissions';
import { fakeMe } from './me';
import { renderScreen, type Handlers } from './render';
import { appDetail } from './store';

const prompt = (over: Partial<NonNullable<AppConfig['env'][number]['prompt']>> = {}) => ({
  label: null,
  description: null,
  type: 'string' as const,
  options: null,
  hidden: false,
  required: false,
  ...over,
});

/** Vaultwarden's settings: one of each kind, as the daemon sends them (secrets without values). */
export function appConfig(extra: Partial<AppConfig> = {}): AppConfig {
  return {
    env: [
      {
        key: 'SIGNUPS_ALLOWED',
        value: 'true',
        secret: false,
        generated: false,
        prompt: prompt({ type: 'boolean', label: 'Let people create accounts' }),
      },
      {
        key: 'WEB_WORKERS',
        value: '4',
        secret: false,
        generated: false,
        prompt: prompt({ type: 'number', label: 'Workers' }),
      },
      {
        key: 'LOG_LEVEL',
        value: 'info',
        secret: false,
        generated: false,
        prompt: prompt({ type: 'select', options: ['info', 'warn', 'error'] }),
      },
      {
        key: 'ADMIN_TOKEN',
        value: null,
        secret: true,
        generated: true,
        prompt: prompt({ type: 'secret', hidden: true }),
      },
      {
        key: 'SMTP_PASSWORD',
        value: null,
        secret: true,
        generated: false,
        prompt: prompt({ type: 'secret', label: 'Mail password' }),
      },
      { key: 'DOMAIN', value: 'https://vaultwarden.hlabs.local', secret: false, generated: false, prompt: null },
    ],
    address: { hostname: 'vaultwarden', domain: 'hlabs.local', taken: ['hlabs', 'www', 'immich'] },
    port: { hostPort: 12001, containerPort: 80, taken: [12002], tailnetHost: null },
    folders: [],
    folderRequests: [],
    devices: { gpu: false, list: [], capabilities: [] },
    network: { internet: true, apps: true, internetReason: null },
    auth: { mode: 'hlabs', ownLogin: true },
    ...extra,
  };
}

export const vaultwarden = (extra: Partial<AppDetail> = {}) =>
  appDetail({
    id: 'vaultwarden',
    name: 'Vaultwarden',
    state: 'running',
    ownLogin: true,
    address: 'vaultwarden.hlabs.local',
    webPort: 12001,
    urls: { local: 'https://vaultwarden.hlabs.local', tailnet: null, port: 12001 },
    ...extra,
  });

const never = () => new Promise(() => {});

export function renderConfig(handlers: Handlers = {}, config: AppConfig = appConfig(), app = vaultwarden()) {
  const dirty: boolean[] = [];
  const result = renderScreen(() => <AppConfigPanel app={app} onDirtyChange={(d) => dirty.push(d)} />, {
    'apps.getConfig': () => config,
    'apps.get': () => app,
    'events.stream': never,
    'auth.me': fakeMe({ role: 'admin' }),
    ...handlers,
  });
  return { ...result, dirty };
}

export function renderPermissions(handlers: Handlers = {}, config: AppConfig = appConfig(), app = vaultwarden()) {
  return renderScreen(() => <AppPermissionsPanel app={app} onDirtyChange={() => {}} />, {
    'apps.getConfig': () => config,
    'apps.get': () => app,
    'events.stream': never,
    'auth.me': fakeMe({ role: 'admin' }),
    ...handlers,
  });
}
