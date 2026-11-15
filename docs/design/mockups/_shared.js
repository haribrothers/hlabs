// Helpers shared by the mockups (inlined by render.mjs before each screen's script).
var h = React.createElement;
var H = window.Hlabs;

// Lucide glyphs (stroke 2), as @hlabs/icons draws them.
var LUCIDE = {
  restart: ['M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8', 'M21 3v5h-5'],
  reinstall: [
    'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z',
  ],
  logs: ['M17 6.1H3', 'M21 12.1H3', 'M15.1 18H3'],
  open: ['M15 3h6v6', 'M10 14 21 3', 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6'],
  close: ['M18 6 6 18', 'm6 6 12 12'],
  back: ['m15 18-6-6 6-6'],
  search: ['M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0z', 'm21 21-4.3-4.3'],
  download: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M7 10l5 5 5-5', 'M12 15V3'],
  settings: ['M20 7h-9', 'M14 17H5', 'M17 20a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M7 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
  stop: ['M7 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z'],
  trash: ['M3 6h18', 'M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6', 'M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2'],
  wifiOff: [
    'M12 20h.01',
    'M8.5 16.429a5 5 0 0 1 7 0',
    'M5 12.859a10 10 0 0 1 5.17-2.69',
    'M19 12.859a10 10 0 0 0-2.007-1.523',
    'M2 8.82a15 15 0 0 1 4.177-2.643',
    'M22 8.82a15 15 0 0 0-11.288-3.764',
    'm2 2 20 20',
  ],
  appWindow: ['M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z', 'M10 4v4', 'M2 8h20', 'M6 4v4'],
  activity: [
    'M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2',
  ],
  lock: ['M7 11V7a5 5 0 0 1 10 0v4', 'M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z'],
  cloud: ['M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z'],
  play: ['M6 3l14 9-14 9z'],
  shield: ['M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z', 'm9 12 2 2 4-4'],
  file: ['M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z', 'M14 2v4a2 2 0 0 0 2 2h4', 'M16 13H8', 'M16 17H8'],
  branch: ['M6 3v12', 'M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M18 9a9 9 0 0 1-9 9'],
  flow: ['M3 3h6v6H3z', 'M15 15h6v6h-6z', 'M9 6h6a3 3 0 0 1 3 3v6'],
  plus: ['M5 12h14', 'M12 5v14'],
  alert: ['M12 9v4', 'M12 17h.01', 'M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z'],
  check: ['M20 6 9 17l-5-5'],
};
function icon(name, size, extra) {
  return h(
    'svg',
    Object.assign(
      { width: size || 16, height: size || 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
      extra || {},
    ),
    LUCIDE[name].map(function (d, i) {
      return h('path', { key: i, d: d });
    }),
  );
}
function btn(variant, size, children, extra) {
  return h('button', Object.assign({ className: 'hl-btn hl-btn-' + variant + ' hl-btn-' + (size || 'md') }, extra || {}), children);
}
function wall(children, opts) {
  opts = opts || {};
  return h(
    'div',
    { className: 'hl-wall', style: { position: 'absolute', inset: 0, padding: 0 } },
    opts.dim ? h('div', { className: 'hl-dim', style: { position: 'absolute', inset: 0, background: opts.dim === 'strong' ? 'var(--scrim-strong)' : 'var(--scrim)' } }) : null,
    children,
  );
}
var APPS = {
  jellyfin: { name: 'Jellyfin', colors: ['#8b5cf6', '#6d28d9'], icon: 'play' },
  pihole: { name: 'Pi-hole', colors: ['#ef4444', '#b91c1c'], icon: 'shield' },
  nextcloud: { name: 'Nextcloud', colors: ['#38bdf8', '#0369a1'], icon: 'cloud' },
  vaultwarden: { name: 'Vaultwarden', colors: ['#334155', '#0f172a'], icon: 'lock' },
  paperless: { name: 'Paperless', colors: ['#4ade80', '#15803d'], icon: 'file' },
  kuma: { name: 'Uptime Kuma', colors: ['#a3e635', '#4d7c0f'], icon: 'activity' },
  gitea: { name: 'Gitea', colors: ['#fbbf24', '#d97706'], icon: 'branch' },
  n8n: { name: 'n8n', colors: ['#f472b6', '#be185d'], icon: 'flow' },
};
function appTile(id, extra) {
  var a = APPS[id];
  return h(H.AppIcon, Object.assign({ name: a.name, colors: a.colors, icon: icon(a.icon, 34) }, extra || {}));
}
function appLogo(id, size) {
  var a = APPS[id];
  return h(
    'div',
    {
      style: {
        width: size, height: size, borderRadius: size * 0.28, flexShrink: 0, color: '#fff',
        background: 'linear-gradient(135deg,' + a.colors[0] + ',' + a.colors[1] + ')',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.18), 0 6px 14px rgba(0,0,0,0.28)',
      },
    },
    icon(a.icon, size * 0.42),
  );
}
function dock(active) {
  return h(
    'div',
    { style: { position: 'absolute', left: 0, right: 0, bottom: 14, display: 'flex', justifyContent: 'center' } },
    h(H.Dock, {
      active: active || 'home',
      badges: { store: 2 },
      magnify: false,
      apps: [
        { id: 'jellyfin', name: 'Jellyfin', colors: APPS.jellyfin.colors, icon: icon('play', 22), open: true },
        { id: 'vaultwarden', name: 'Vaultwarden', colors: APPS.vaultwarden.colors, icon: icon('lock', 22) },
      ],
      onAdd: function () {},
    }),
  );
}
function render(el) {
  ReactDOM.createRoot(document.getElementById('root')).render(el);
}
// Text styles used across windows.
var T = {
  title: { margin: 0, font: '700 28px/34px var(--font-sans)', color: 'var(--ink)' },
  h2: { margin: 0, font: '700 22px/28px var(--font-sans)', color: 'var(--ink)' },
  section: { margin: '0 0 8px', font: '700 13px/18px var(--font-sans)', color: 'var(--ink)' },
  body: { margin: 0, font: '400 14px/20px var(--font-sans)', color: 'var(--ink)' },
  muted: { margin: 0, font: '400 13px/18px var(--font-sans)', color: 'var(--ink-muted)' },
  mono: { fontFamily: 'var(--font-mono)' },
};

// An area window (App Store, Settings, Logs…): level-2 glass, inset as the AppLogs screen draws it.
function areaWindow(children, style) {
  return h('div', {
    className: 'hl-glass hl-glass-2',
    style: Object.assign({ boxSizing: 'border-box', position: 'absolute', left: 100, right: 100, top: 40, bottom: 40, borderRadius: 'var(--radius-window)', padding: 28, display: 'flex', flexDirection: 'column', gap: 18 }, style || {}),
  }, children);
}
function circleBtn(name, label) {
  return h('button', { className: 'hl-btn hl-btn-secondary', 'aria-label': label, style: { width: 36, height: 36, padding: 0 } }, icon(name, 16));
}
function chip(label, on) {
  return h('button', { className: 'hl-btn hl-btn-sm ' + (on ? 'hl-btn-primary' : 'hl-btn-secondary'), style: { height: 36, padding: '0 14px' } }, label);
}
var LEVEL = { INFO: 'var(--accent-link)', WARN: 'var(--warning)', ERROR: 'var(--danger)' };
function logConsole(lines, extra) {
  return h('div', {
    style: Object.assign({ flex: 1, borderRadius: 'var(--radius-md)', background: 'rgba(6,4,16,0.55)', padding: '18px 20px', font: '400 13px/25.5px var(--font-mono)', color: 'var(--ink)', overflow: 'hidden' }, extra || {}),
  }, lines.map(function (l, i) {
    if (l.divider) return h('div', { key: i, style: { color: 'var(--ink-faint)', textAlign: 'center', margin: '4px 0' } }, '— ' + l.divider + ' —');
    return h('div', { key: i, style: { display: 'flex', gap: 14, whiteSpace: 'pre' } },
      h('span', { style: { color: 'var(--ink-faint)' } }, l[0]),
      h('span', { style: { color: LEVEL[l[1]] || 'transparent', fontWeight: 700, width: 44 } }, l[1]),
      h('span', null, l[2]));
  }));
}

// App settings (US-APP-04): a level-2 window centred over the dimmed wallpaper, as the AppSettings screen draws it.
function settingsWindow(o) {
  var row = function (title, sub, trailing, key) {
    return h('div', { key: key || title, style: { display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', minHeight: 52, borderTop: key === 0 ? 'none' : '1px solid var(--hairline)' } },
      h('div', { style: { flex: 1 } }, h('p', { style: T.body }, title), sub ? h('p', { style: Object.assign({}, T.muted, { fontSize: 12 }) }, sub) : null),
      trailing);
  };
  var group = function (label, rows) {
    return h('div', { key: label },
      h('p', { style: T.section }, label),
      h('div', { style: { borderRadius: 'var(--radius-md)', background: 'var(--surface-row)', overflow: 'hidden' } }, rows));
  };
  var sw = function (on) { return h('span', { className: 'hl-switch', 'aria-checked': String(on), role: 'switch' }, h('span', { className: 'hl-switch-knob' })); };
  return h('div', {
    className: 'hl-glass hl-glass-2',
    style: { boxSizing: 'border-box', position: 'absolute', left: 420, width: 600, top: 50, bottom: 50, borderRadius: 'var(--radius-window)', padding: 28, display: 'flex', flexDirection: 'column', gap: 18 },
  },
    h('header', { style: { display: 'flex', alignItems: 'center', gap: 16 } },
      appLogo(o.app, 64),
      h('div', { style: { flex: 1 } },
        h('h1', { style: T.h2 }, APPS[o.app].name),
        o.status),
      circleBtn('close', 'Close')),
    o.progress || null,
    h('div', { style: { alignSelf: 'flex-start' } },
      h(H.Segmented, { 'aria-label': 'App sections', value: 'o', options: [{ value: 'o', label: 'Overview' }, { value: 'c', label: 'Configuration' }, { value: 'p', label: 'Permissions' }, { value: 'u', label: 'Usage' }] })),
    h('div', { style: { display: 'flex', gap: 10 } }, o.actions),
    group('Access', [row('https://uptime-kuma.hlabs.local', 'Also on your tailnet', btn('secondary', 'sm', 'Copy'), 0)]),
    group('Behaviour', [row('Start automatically', null, sw(true), 0), row('Include in backups', null, sw(true), 1), row('Update automatically', null, sw(false), 2)]),
    group('Storage and resources', [row('Data folder', null, h('span', { style: Object.assign({}, T.muted, T.mono, { fontSize: 12 }) }, '~/hlabs/app-data/uptime-kuma'), 0), row('Using now', null, h('span', { style: Object.assign({}, T.muted, { fontSize: 12 }) }, o.usingNow), 1)]),
    h('footer', { style: { marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 18 } },
      h('span', { style: Object.assign({}, T.muted, { flex: 1 }) }, 'Version 1.23.16 · up to date'),
      o.footer));
}

// Home (US-HOME-01…03), as the HomeStates screen draws it.
var bar = function (pct) {
  return h('div', { style: { height: 6, borderRadius: 3, background: 'var(--surface-control)', marginTop: 6 } }, h('div', { style: { width: pct + '%', height: 6, borderRadius: 3, background: 'var(--accent)' } }));
};
var widget = function (title, body, key) {
  return h('div', { key: key, className: 'hl-glass hl-glass-1', style: { boxSizing: 'border-box', width: 268, height: 156, borderRadius: 'var(--radius-xl)', padding: '22px 20px' } },
    h('p', { style: Object.assign({}, T.muted, { marginBottom: 12 }) }, title), body);
};
var HOME_TILES = [
  ['jellyfin'], ['kuma', { state: 'error' }], ['pihole'], ['vaultwarden'], ['nextcloud', { state: 'installing', progress: 42 }], ['gitea'],
  ['paperless'], ['n8n'],
];

// Settings (US-ACCT-01/02): the sidebar window, as the SettingsAccount screen draws it.
var APP_ICON = 'file://' + (window.HLABS_ROOT || '') + '/docs/design/logos/hlabs-app-icon.svg';
function listGroup(label, rows) {
  return h('div', { key: label },
    label ? h('p', { style: T.section }, label) : null,
    h('div', { style: { borderRadius: 'var(--radius-md)', background: 'var(--surface-row)', overflow: 'hidden' } },
      rows.map(function (r, i) {
        return h('div', { key: i, style: { display: 'flex', alignItems: 'center', gap: 14, padding: '12px 18px', minHeight: 62, boxSizing: 'border-box', borderTop: i ? '1px solid var(--hairline)' : 'none' } },
          r.leading || null,
          h('div', { style: { flex: 1 } },
            h('p', { style: Object.assign({}, T.body, r.titleStyle || {}) }, r.title),
            r.sub ? h('p', { style: Object.assign({}, T.muted, { color: r.subColor || 'var(--ink-muted)' }) }, r.sub) : null),
          r.trailing || null);
      })));
}
function settingsArea(content, active) {
  var items = ['Account', 'Users', 'Appearance', 'Notifications', 'Network & remote access', 'Storage', 'Engine & startup', 'Backups', 'Updates', 'Advanced', 'About'];
  return h('div', { className: 'hl-glass hl-glass-2', style: { boxSizing: 'border-box', position: 'absolute', left: 100, right: 100, top: 30, bottom: 130, borderRadius: 'var(--radius-window)', display: 'flex', overflow: 'hidden' } },
    h('nav', { style: { width: 260, borderRight: '1px solid var(--hairline)', padding: '26px 14px', boxSizing: 'border-box' } },
      h('h1', { style: Object.assign({}, T.h2, { padding: '0 12px 16px' }) }, 'Settings'),
      items.map(function (t) {
        var on = t === (active || 'Account');
        return h('div', { key: t, style: { padding: '10px 12px', borderRadius: 10, font: (on ? '700' : '400') + ' 14px/20px var(--font-sans)', color: 'var(--ink)', background: on ? 'var(--surface-control)' : 'none' } }, t);
      })),
    h('main', { style: { flex: 1, padding: '28px 36px', display: 'flex', flexDirection: 'column', gap: 22, overflow: 'hidden' } }, content));
}
function profileCard() {
  return h('div', { style: { display: 'flex', alignItems: 'center', gap: 14, padding: 18, borderRadius: 'var(--radius-lg)', background: 'var(--surface-row)' } },
    h('div', { style: { width: 58, height: 58, borderRadius: 29, background: 'linear-gradient(135deg,#a78bfa,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', font: '700 24px var(--font-sans)', color: '#fff' } }, 'H'),
    h('div', { style: { flex: 1 } }, h('p', { style: Object.assign({}, T.body, { fontWeight: 700, fontSize: 17 }) }, 'Hari'), h('p', { style: T.muted }, 'hari · Admin')),
    btn('secondary', 'sm', 'Edit profile'));
}
function hlabsAppIcon(size) {
  return h('img', { src: APP_ICON, width: size, height: size, alt: '', style: { borderRadius: size * 0.24, flexShrink: 0 } });
}
// The "Use hlabs as an app" card (US-INST-28), one row per state.
function desktopAppCard(variant, noLabel) {
  var intro = 'Open hlabs in its own window from your Dock or Start menu, without a browser tab.';
  var rows = [];
  if (variant === 'chrome') rows.push({ leading: hlabsAppIcon(44), title: 'Use hlabs as an app', sub: intro, trailing: btn('secondary', 'sm', [icon('download', 14, { key: 'i' }), 'Install hlabs']) });
  if (variant === 'safari') rows.push({ leading: hlabsAppIcon(44), title: 'Use hlabs as an app', sub: [intro, h('br', { key: 'b' }), h('span', { key: 's', style: { color: 'var(--ink)' } }, 'In Safari, choose File › Add to Dock.')] });
  if (variant === 'other') rows.push({ leading: hlabsAppIcon(44), title: 'Use hlabs as an app', sub: [intro, h('br', { key: 'b' }), h('span', { key: 's', style: { color: 'var(--ink)' } }, 'To install hlabs, open it in Chrome, Edge or Safari.')], trailing: btn('secondary', 'sm', 'How to install') });
  if (variant === 'installed') rows.push({ leading: hlabsAppIcon(44), title: 'Use hlabs as an app', sub: 'hlabs is installed on this computer.', subColor: 'var(--success)' });
  if (variant === 'chrome-tailnet') {
    rows.push({ leading: hlabsAppIcon(44), title: 'Use hlabs as an app', sub: intro, trailing: btn('secondary', 'sm', [icon('download', 14, { key: 'i' }), 'Install hlabs']) });
    rows.push({ leading: h('span', { style: { width: 44, display: 'flex', justifyContent: 'center', color: 'var(--accent-link)' } }, icon('appWindow', 20)), title: 'Install it from your tailnet address so the app works at home and away.', titleStyle: { fontSize: 13 }, sub: h('span', { style: T.mono }, 'https://hlabs.tail4f2a.ts.net'), trailing: btn('secondary', 'sm', 'Open tailnet address') });
  }
  return listGroup(noLabel ? null : 'This computer', rows);
}
