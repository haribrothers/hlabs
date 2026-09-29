// US-STORE-13 · Understand why an install failed.
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderScreen } from '../test/render';
import { appDetail, details, installJob } from '../test/store';
import { failureReason, InstallProgressPage } from './install-progress';

const never = () => new Promise(() => {});

function failed(stateDetail: Record<string, unknown>) {
  return renderScreen(() => <InstallProgressPage appId="immich" />, {
    'store.getApp': () => details(),
    'apps.get': () => appDetail({ state: 'install_failed', stateDetail, nextFreePort: 12004 }),
    'jobs.get': () =>
      installJob({ state: 'failed', step: String(stateDetail.step), hlabsCode: stateDetail.code as never }),
    'apps.list': () => ({ apps: [] }),
    'events.stream': never,
  });
}

describe('US-STORE-13', () => {
  it('says "Install failed", keeps completed steps checked and marks the failed one with its reason', async () => {
    failed({ code: 'APP_PORT_IN_USE', port: 2283, step: 'start' });
    expect(await screen.findByText('Install failed')).toBeInTheDocument();
    expect(screen.getByText('Nothing else was changed')).toBeInTheDocument();
    const items = within(screen.getByRole('list', { name: 'Install steps' })).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Checked compatibility');
    expect(items[2]).toHaveTextContent('Created data folders');
    expect(items[3]).toHaveTextContent('Failed');
    expect(items[3]).toHaveTextContent('Port 2283 is already used by another program on this computer.');
    expect(within(items[3]!).getByRole('button', { name: 'Use a different port' })).toBeInTheDocument();
    expect(items[4]).not.toHaveTextContent('Failed');
    // No "you can leave" note once it has stopped.
    expect(screen.queryByText(/You can leave this page/)).toBeNull();
  });

  it('no platform: says so and goes back to the store', async () => {
    failed({ code: 'APP_NO_PLATFORM', step: 'check' });
    expect(await screen.findByText("There's no Apple Silicon version of this app.")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to App Store' })).toHaveAttribute('href', '/store');
  });

  it('network and health failures offer "Try again"', async () => {
    failed({ code: 'APP_HEALTH_TIMEOUT', seconds: 120, step: 'start' });
    expect(await screen.findByText("Immich didn't start within 120 seconds.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('a stopped engine links to Engine settings', async () => {
    failed({ code: 'ENGINE_UNAVAILABLE', step: 'pull' });
    expect(await screen.findByText('The container engine stopped.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Engine settings' })).toHaveAttribute('href', '/settings/engine');
  });

  it('each code has its own plain words; unknown ones never show the raw message', () => {
    expect(failureReason({ code: 'APP_DISK_FULL', neededBytes: 5 * 2 ** 30 }, 'Immich', 'macos')).toBe(
      'Not enough free space. Needs 5 GB.',
    );
    expect(failureReason({ code: 'APP_NETWORK_UNREACHABLE' }, 'Immich', 'macos')).toBe(
      "hlabs couldn't reach the internet to download the app.",
    );
    expect(failureReason({ code: 'APP_NO_PLATFORM' }, 'Immich', 'linux')).toBe("There's no ARM64 version of this app.");
    expect(failureReason({ code: 'INTERNAL', message: 'ENOENT /var/x' }, 'Immich', 'macos')).toBe(
      'Something went wrong while installing.',
    );
    expect(failureReason({ reason: 'restarted' }, 'Immich', 'macos')).toBe('hlabs restarted during the install.');
    // A container that stopped with an error while starting, rather than a slow start.
    expect(failureReason({ code: 'APP_HEALTH_TIMEOUT', service: 'n8n', exitCode: 1 }, 'n8n', 'macos')).toBe(
      'n8n stopped while starting.',
    );
  });
});
