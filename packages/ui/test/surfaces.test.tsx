import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  AppIcon,
  Button,
  Dialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  GlassCard,
  List,
  ListRow,
  Menu,
  ModalDialog,
  Stepper,
  Toast,
  TrayMenu,
  TraySetup,
} from '../src/index';

describe('GlassCard, List, ListRow', () => {
  it('uses the glass level and names the card', () => {
    render(<GlassCard level={2} title="Storage" />);
    expect(screen.getByRole('region', { name: 'Storage' })).toHaveClass('hl-glass-2');
  });

  it('groups rows under their label; href rows are links', () => {
    render(
      <List label="Startup">
        <ListRow title="Start automatically" subtitle="After a restart" />
        <ListRow title="Logs" href="/settings/logs" />
      </List>,
    );
    const group = screen.getByRole('group', { name: 'Startup' });
    expect(within(group).getByText('After a restart')).toHaveClass('hl-list-sub');
    expect(within(group).getByRole('link', { name: 'Logs' })).toHaveAttribute('href', '/settings/logs');
  });

  it('puts full-width content below a row', () => {
    render(<ListRow title="Container runtime" below={<span>Installing</span>} />);
    expect(screen.getByText('Installing').parentElement).toHaveClass('hl-list-below');
    expect(screen.getByText('Installing').parentElement!.parentElement).toHaveClass('hl-list-row-below');
  });
});

describe('AppIcon', () => {
  it('says the state in its name and on the tile', () => {
    const { rerender } = render(<AppIcon name="Jellyfin" state="stopped" />);
    expect(screen.getByRole('button', { name: 'Jellyfin, stopped' })).toHaveClass('hl-app-stopped');
    expect(screen.getByText('Stopped')).toHaveClass('hl-app-badge-stopped');
    rerender(<AppIcon name="Jellyfin" state="installing" progress={62} />);
    expect(screen.getByRole('button', { name: 'Jellyfin, installing, 62%' })).toBeInTheDocument();
    expect(screen.getByText('Installing… 62%')).toBeInTheDocument();
    rerender(<AppIcon name="Jellyfin" state="busy" status="Restarting…" />);
    expect(screen.getByRole('button', { name: 'Jellyfin, restarting' })).toHaveTextContent('Restarting…');
    rerender(<AppIcon name="Jellyfin" state="updating" />);
    expect(screen.getByRole('button', { name: 'Jellyfin, updating' })).toHaveTextContent('Updating…');
    expect(document.querySelector('.hl-app-ring-turning')).not.toBeNull();
    rerender(<AppIcon name="Jellyfin" state="error" />);
    expect(screen.getByRole('button', { name: 'Jellyfin, error' })).toBeInTheDocument();
    rerender(<AppIcon name="Jellyfin" href="https://jellyfin.hlabs.local" />);
    expect(screen.getByRole('link', { name: 'Jellyfin' })).toBeInTheDocument();
  });
});

describe('Dialog', () => {
  it('labels the frame with its title', () => {
    render(
      <Dialog role="alertdialog" title="Uninstall Jellyfin?" actions={<Button variant="destructive">Uninstall</Button>}>
        Your media stays in Files.
      </Dialog>,
    );
    expect(screen.getByRole('alertdialog', { name: 'Uninstall Jellyfin?' })).toBeInTheDocument();
  });

  it('as a modal traps focus, closes on Escape and returns focus to the trigger', async () => {
    function Example() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <Button onClick={() => setOpen(true)}>Uninstall…</Button>
          <ModalDialog
            open={open}
            onOpenChange={setOpen}
            role="alertdialog"
            title="Uninstall Jellyfin?"
            actions={
              <>
                <Button variant="secondary" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button variant="destructive">Uninstall</Button>
              </>
            }
          >
            Your media stays in Files.
          </ModalDialog>
        </>
      );
    }
    render(<Example />);
    const trigger = screen.getByRole('button', { name: 'Uninstall…' });
    await userEvent.click(trigger);
    const dialog = await screen.findByRole('alertdialog', { name: 'Uninstall Jellyfin?' });
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    await userEvent.tab();
    await userEvent.tab();
    await userEvent.tab();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('can refuse Escape while work is running', async () => {
    const onOpenChange = vi.fn();
    render(<ModalDialog open onOpenChange={onOpenChange} dismissible={false} title="Uninstalling Jellyfin" />);
    await userEvent.keyboard('{Escape}');
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});

describe('Toast', () => {
  it('announces danger as an alert and the rest as status', async () => {
    const onDismiss = vi.fn();
    const { rerender } = render(<Toast title="Backup finished" />);
    expect(screen.getByRole('status')).toHaveTextContent('Backup finished');
    rerender(
      <Toast tone="danger" title="Backup failed" onDismiss={onDismiss}>
        Plug in the backup drive and try again.
      </Toast>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Plug in the backup drive');
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismiss).toHaveBeenCalled();
  });
});

describe('Menu', () => {
  it('moves between enabled items with arrow keys and runs onSelect', async () => {
    const onOpen = vi.fn();
    render(
      <Menu
        label="Jellyfin"
        items={[
          { label: 'Open', onSelect: onOpen },
          { label: 'Restart', disabled: true },
          { separator: true },
          { label: 'Uninstall…', danger: true },
        ]}
      />,
    );
    const menu = screen.getByRole('menu', { name: 'Jellyfin' });
    const items = within(menu).getAllByRole('menuitem');
    items[0]!.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Uninstall…' })).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Open' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(onOpen).toHaveBeenCalled();
    expect(screen.getByRole('menuitem', { name: 'Restart' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('separator')).toBeInTheDocument();
  });

  it('as a dropdown opens from its trigger and closes on select', async () => {
    const onRestart = vi.fn();
    render(
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary">More</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent aria-label="Jellyfin">
          <DropdownMenuItem onSelect={onRestart}>Restart</DropdownMenuItem>
          <DropdownMenuItem danger>Uninstall…</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'More' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Restart' }));
    expect(onRestart).toHaveBeenCalled();
    expect(screen.queryByRole('menu')).toBeNull();
  });
});

describe('TrayMenu and Stepper', () => {
  it('shows status in words and the quick actions', () => {
    render(
      <TrayMenu
        statusText="Running"
        stats={[
          { label: 'CPU', value: '12%' },
          { label: 'Memory', value: '6.1 GB' },
          { label: 'Free', value: '420 GB' },
        ]}
        items={[{ label: 'Open Dashboard' }, { label: 'Quit hlabs' }]}
      />,
    );
    expect(screen.getByRole('menu', { name: 'hlabs' })).toHaveTextContent('Running');
    expect(screen.getByText('6.1 GB')).toBeInTheDocument();
    expect(screen.getAllByRole('menuitem')).toHaveLength(2);
  });

  it('error states: the status in words, a note announced as an alert and one primary button', () => {
    const onSelect = vi.fn();
    render(
      <TrayMenu
        tone="danger"
        statusText="Needs Keychain access"
        note={{ body: 'hlabs needs Keychain access to work.' }}
        action={{ label: 'Try again', onSelect }}
        items={[{ label: 'Quit hlabs' }]}
      />,
    );
    expect(screen.getByRole('menu', { name: 'hlabs' })).toHaveTextContent('Needs Keychain access');
    expect(screen.getByRole('alert')).toHaveTextContent('hlabs needs Keychain access to work.');
    screen.getByRole('button', { name: 'Try again' }).click();
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("TraySetup: the first-launch checklist says each step's state in words", () => {
    render(
      <TraySetup
        title="Setting up hlabs"
        subtitle="This happens once"
        steps={[
          { label: 'Starting background service', state: 'done' },
          { label: 'Opening setup in your browser…', state: 'working' },
        ]}
        stateLabels={{ done: 'done', working: 'in progress', pending: 'not started' }}
      />,
    );
    expect(screen.getByRole('region', { name: 'Setting up hlabs' })).toHaveTextContent('This happens once');
    expect(screen.getByText('(done)', { exact: false })).toBeInTheDocument();
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Starting background service (done)');
    expect(items[1]).toHaveTextContent('Opening setup in your browser… (in progress)');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '75');
  });

  it('says which step of how many, with the current step marked', () => {
    render(<Stepper steps={['Welcome', 'System check', 'Account']} current={1} />);
    expect(screen.getByRole('navigation', { name: 'Setup progress' })).toHaveTextContent('Step 2 of 3 · System check');
    const current = screen.getAllByRole('listitem')[1]!;
    expect(current).toHaveAttribute('aria-current', 'step');
    expect(screen.getByText('Welcome (done)')).toBeInTheDocument();
  });

  it('can show only "Step N of M"', () => {
    render(<Stepper steps={['System check', 'Account']} current={0} showName={false} />);
    expect(screen.getByText('Step 1 of 2')).toBeInTheDocument();
  });
});
