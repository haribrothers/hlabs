// Development-only preview of every @hlabs/ui component in glass and solid themes and each accent.
// Not reachable in production builds.
import { Download, Film, Settings2 } from '@hlabs/icons';
import {
  AppIcon,
  Badge,
  BarChart,
  Button,
  Dialog,
  Dock,
  GlassCard,
  LineChart,
  List,
  ListRow,
  Menu,
  ModalDialog,
  Progress,
  Segmented,
  Sparkline,
  StackedBar,
  StatusDot,
  Stepper,
  Switch,
  TabBar,
  TextField,
  Toast,
  TrayMenu,
} from '@hlabs/ui';
import { FileItem } from '@hlabs/ui/files';
import { createFileRoute, notFound } from '@tanstack/react-router';
import { useEffect, useState, type ReactNode } from 'react';
import { devCopy } from '../../copy/dev';
import { useEventStream } from '../../lib/use-event-stream';
import { navigationAreas } from '../../shell/areas';

export const Route = createFileRoute('/dev/ui')({
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound();
  },
  component: DevUi,
});

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="m-0 text-headline">{title}</h2>
      <div className="flex flex-wrap items-start gap-4">{children}</div>
    </section>
  );
}

function EventStream() {
  const { status, last } = useEventStream();
  const [sending, setSending] = useState(false);
  const send = async () => {
    setSending(true);
    await fetch('/dev/emit-test-event', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: `Hello at ${new Date().toLocaleTimeString()}` }),
    });
    setSending(false);
  };
  return (
    <GlassCard level={2} title={devCopy.events} className="min-w-80">
      <StatusDot status={status === 'connected' ? 'running' : 'working'}>
        <span data-testid="stream-status">{devCopy[status]}</span>
      </StatusDot>
      <code className="text-mono text-ink-muted" data-testid="last-event">
        {last ? `${last.type} ${JSON.stringify(last.data)}` : devCopy.noEvents}
      </code>
      <Button variant="secondary" size="sm" onClick={send} disabled={sending}>
        {devCopy.sendTest}
      </Button>
    </GlassCard>
  );
}

function DevUi() {
  const [theme, setTheme] = useState('glass');
  const [accent, setAccent] = useState('violet');
  const [dialogOpen, setDialogOpen] = useState(false);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.accent = accent;
  }, [theme, accent]);
  const areas = navigationAreas();

  return (
    <div className="mx-auto flex w-full max-w-window flex-col gap-10">
      <h1 className="m-0 text-title-1">{devCopy.title}</h1>
      <div className="flex flex-wrap gap-6">
        <Segmented
          aria-label={devCopy.theme}
          value={theme}
          onChange={setTheme}
          options={[
            { value: 'glass', label: 'Glass' },
            { value: 'solid', label: 'Solid' },
          ]}
        />
        <Segmented
          aria-label={devCopy.accent}
          value={accent}
          onChange={setAccent}
          options={['violet', 'mint', 'amber', 'rose'].map((a) => ({
            value: a,
            label: a[0]!.toUpperCase() + a.slice(1),
          }))}
        />
      </div>

      <EventStream />

      <Section title="Buttons">
        <Button>Install</Button>
        <Button variant="secondary">Open</Button>
        <Button variant="destructive">Uninstall</Button>
        <Button variant="link">Learn more</Button>
        <Button size="sm" variant="secondary">
          <Download size={16} aria-hidden="true" /> Download
        </Button>
        <Button size="lg">Continue</Button>
      </Section>

      <Section title="Inputs">
        <TextField label="Username" placeholder="hari" hint="Lowercase letters, numbers and dashes" />
        <TextField label="Password" type="password" error="Use at least 12 characters" />
        <Switch label="Start automatically" defaultChecked />
        <Segmented
          aria-label="Time range"
          options={[
            { value: '1h', label: '1 hour' },
            { value: '24h', label: '24 hours' },
            { value: '7d', label: '7 days' },
          ]}
        />
      </Section>

      <Section title="Status">
        <Badge>Admin</Badge>
        <Badge tone="success">Installed</Badge>
        <Badge tone="warning">Update available</Badge>
        <Badge tone="danger">Failed</Badge>
        <Badge tone="accent">New</Badge>
        <StatusDot status="running">Running</StatusDot>
        <StatusDot status="working">Starting…</StatusDot>
        <StatusDot status="failed">Needs attention</StatusDot>
        <StatusDot status="stopped">Stopped</StatusDot>
        <Progress value={62} label="Downloading Immich" detail="1.2 of 2.4 GB" />
        <Stepper steps={['Welcome', 'System check', 'Account', 'Two-factor', 'Storage', 'Done']} current={2} />
      </Section>

      <Section title="Apps">
        <AppIcon name="Jellyfin" colors={['#8b5cf6', '#4c1d95']} icon={<Film size={34} aria-hidden="true" />} />
        <AppIcon name="Immich" state="installing" progress={62} />
        <AppIcon name="Vaultwarden" state="update" />
        <AppIcon name="Paperless" state="stopped" />
        <AppIcon name="n8n" state="error" />
      </Section>

      <Section title="Surfaces">
        <GlassCard title="Storage" className="w-72">
          <StackedBar
            unit="GB"
            total={1000}
            segments={[
              { label: 'Apps', value: 120 },
              { label: 'Files', value: 340 },
              { label: 'System', value: 40 },
            ]}
          />
        </GlassCard>
        <div className="w-96">
          <List label="Startup">
            <ListRow
              title="Start automatically"
              subtitle="Apps come back after a restart"
              trailing={<Switch aria-label="Start automatically" />}
            />
            <ListRow title="Logs" leading={<Settings2 size={20} aria-hidden="true" />} href="#" />
          </List>
        </div>
        <Dialog
          role="alertdialog"
          title="Uninstall Jellyfin?"
          actions={
            <>
              <Button variant="secondary">Cancel</Button>
              <Button variant="destructive" onClick={() => setDialogOpen(true)}>
                Uninstall
              </Button>
            </>
          }
        >
          Your media stays in Files. Jellyfin's settings and watch history are deleted.
        </Dialog>
        <ModalDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          title="Modal dialog"
          actions={<Button onClick={() => setDialogOpen(false)}>Close</Button>}
        >
          Focus is trapped here; Escape closes.
        </ModalDialog>
        <Toast title="Backup finished" action={<Button variant="link">View log</Button>}>
          2.1 GB added
        </Toast>
        <Toast tone="danger" title="Backup failed" onDismiss={() => {}}>
          Plug in the backup drive and try again.
        </Toast>
      </Section>

      <Section title="Menus">
        <Menu
          label="Jellyfin"
          items={[
            { label: 'Open', shortcut: '↵' },
            { label: 'Restart' },
            { label: 'Start automatically', checked: true },
            { separator: true },
            { label: 'Uninstall…', danger: true },
          ]}
        />
        <TrayMenu
          statusText="Running"
          stats={[
            { label: 'CPU', value: '12%' },
            { label: 'Memory', value: '6.1 GB' },
            { label: 'Free', value: '420 GB' },
          ]}
          items={[
            { label: 'Open Dashboard' },
            { label: 'Copy address' },
            { label: 'Back up now' },
            { separator: true },
            { label: 'Quit hlabs' },
          ]}
        />
      </Section>

      <Section title="Charts">
        <div className="w-[560px] max-w-full">
          <LineChart
            title="CPU"
            unit="%"
            max={100}
            labels={['10:00', '10:05', '10:10', '10:15', '10:20', '10:25']}
            series={[
              { name: 'Immich', values: [10, 40, 25, 30, 22, 18] },
              { name: 'Jellyfin', values: [5, 8, 30, 12, 9, 14] },
            ]}
          />
        </div>
        <div className="w-[560px] max-w-full">
          <BarChart
            title="Backup size"
            unit=" GB"
            data={[
              { label: 'Mon', value: 2.1 },
              { label: 'Tue', value: 1.4 },
              { label: 'Wed', value: 0, status: 'failed' },
              { label: 'Thu', value: 3.2 },
            ]}
          />
        </div>
        <Sparkline values={[3, 5, 4, 8, 6, 9, 12]} />
      </Section>

      <Section title="Files">
        <FileItem name="Photos" kind="folder" path="/home/Photos" meta="1,204 items" />
        <FileItem name="Taxes 2025.pdf" meta="1.2 MB" selected />
        <FileItem name="notes.md" meta="4 KB" shared />
      </Section>

      <Section title="Navigation">
        <Dock areas={areas} active="files" apps={[{ id: 'immich', name: 'Immich', open: true }]} onAdd={() => {}} />
        <TabBar items={areas} defaultActive="home" />
      </Section>
    </div>
  );
}
