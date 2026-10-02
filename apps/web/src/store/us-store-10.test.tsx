// US-STORE-10 · Fill in app settings and accept risky permissions.
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { daemonError, renderScreen } from '../test/render';
import { details } from '../test/store';
import { InstallSheet } from './install-sheet';

type Prompt = ReturnType<typeof details>['install']['env'][number];
const prompt = (key: string, extra: Partial<Prompt> = {}): Prompt => ({
  key,
  label: key,
  description: null,
  type: 'string',
  options: null,
  default: null,
  required: false,
  ...extra,
});

function sheet(d: ReturnType<typeof details>, install: (input: unknown) => unknown = () => ({ jobId: 'j1' })) {
  return renderScreen(() => <InstallSheet details={d} open onOpenChange={() => {}} />, {
    'apps.install': install,
    'apps.list': () => ({ apps: [] }),
  });
}

const withEnv = (env: Prompt[], extra: Partial<ReturnType<typeof details>['install']> = {}) =>
  details({ folders: [], install: { ...details().install, env, ...extra } });

describe('US-STORE-10', () => {
  it('shows each prompt by its type, with defaults filled in', async () => {
    sheet(
      withEnv([
        prompt('Site name', { default: 'Family' }),
        prompt('Port', { type: 'number', default: '8080' }),
        prompt('API key', { type: 'secret' }),
        prompt('Sign-ups', { type: 'boolean', default: 'true' }),
        prompt('Mode', { type: 'select', options: ['light', 'full'], default: 'full' }),
      ]),
    );
    expect(await screen.findByRole('textbox', { name: 'Site name' })).toHaveValue('Family');
    expect(screen.getByRole('spinbutton', { name: 'Port' })).toHaveValue(8080);
    const secret = screen.getByLabelText('API key');
    expect(secret).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByRole('button', { name: 'Show' }));
    expect(secret).toHaveAttribute('type', 'text');
    expect(screen.getByRole('switch', { name: 'Sign-ups' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'full' })).toBeChecked();
  });

  it('an empty required prompt says "Required" and takes focus; nothing is sent', async () => {
    const { calls } = sheet(
      withEnv([prompt('Site name', { default: 'x' }), prompt('Admin email', { required: true })]),
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Install' }));
    expect(await screen.findByText('Required')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Admin email' })).toHaveFocus();
    expect(calls.some((c) => c.path === 'apps.install')).toBe(false);
  });

  it("the daemon's APP_ENV_INVALID shows on the field", async () => {
    sheet(withEnv([prompt('Port', { type: 'number', default: '1' })]), () => {
      throw daemonError('APP_ENV_INVALID', { key: 'Port', reason: 'number' });
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Install' }));
    expect(await screen.findByText('Enter a number')).toBeInTheDocument();
  });

  it('risky access is explained in red and needs "I understand"', async () => {
    const { calls } = sheet(
      details({
        folders: [],
        access: { network: 'lan', ports: [{ label: 'DNS', host: 53, protocol: 'udp' }], gpu: true, dockerSocket: true },
        install: { ...details().install, risky: true },
      }),
    );
    const block = await screen.findByRole('region', { name: 'This app asks for more access' });
    expect(block).toHaveTextContent('It can control Docker');
    expect(block).toHaveTextContent('It opens port 53 (DNS) to your network.');
    expect(block).toHaveTextContent('It uses your graphics card.');
    const install = screen.getByRole('button', { name: 'Install' });
    expect(install).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: 'I understand' }));
    expect(install).toBeEnabled();
    fireEvent.click(install);
    await vi.waitFor(() =>
      expect(calls.find((c) => c.path === 'apps.install')?.input).toMatchObject({ acceptRisks: true }),
    );
  });

  it('someone not allowed to install sees "Ask an admin to install this app"', async () => {
    sheet(withEnv([], { allowed: false }));
    expect(await screen.findByText('Ask an admin to install this app')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Install' })).toBeNull();
  });
});
