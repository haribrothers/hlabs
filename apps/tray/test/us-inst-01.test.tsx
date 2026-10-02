// US-INST-01 · First launch installs the background service: what the window shows while it starts.
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { Menu } from '../src/menu';
import { answer, emit, reset } from './tauri';

const boot = (step: string, firstLaunch = true) => ({ firstLaunch, step, reason: null, setupOpened: false });

describe('US-INST-01 · First launch installs the background service', () => {
  beforeEach(reset);

  it('shows "Setting up hlabs" with the checklist while the background service starts', async () => {
    answer({ boot: boot('starting') });
    render(<Menu />);
    const card = await screen.findByRole('region', { name: 'Setting up hlabs' });
    expect(card).toHaveTextContent('This happens once');
    const [service, browser] = screen.getAllByRole('listitem');
    expect(service).toHaveTextContent('Starting background service (in progress)');
    expect(browser).toHaveTextContent('Opening setup in your browser… (not started)');
  });

  it('checks off "Starting background service" once /healthz answers', async () => {
    answer({ boot: boot('starting'), setupUrl: 'http://127.0.0.1:7474/setup?token=x' });
    render(<Menu />);
    await screen.findByRole('region', { name: 'Setting up hlabs' });
    act(() => emit('boot-changed', boot('started')));
    expect(screen.getAllByRole('listitem')[0]).toHaveTextContent('Starting background service (done)');
  });

  it('switches to "Can\'t reach hlabs" when the daemon doesn\'t answer within 60 s', async () => {
    answer({ boot: boot('starting') });
    render(<Menu />);
    await screen.findByRole('region', { name: 'Setting up hlabs' });
    act(() => emit('boot-changed', boot('failed')));
    expect(screen.getByRole('menu', { name: 'hlabs' })).toHaveTextContent("Can't reach hlabs");
    expect(screen.queryByRole('region', { name: 'Setting up hlabs' })).not.toBeInTheDocument();
  });

  it('shows no first-launch window when hlabs has run before and is set up', async () => {
    answer({ boot: boot('started', false), setupUrl: null });
    render(<Menu />);
    expect(await screen.findByText('Open Dashboard')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Setting up hlabs' })).not.toBeInTheDocument();
  });
});
