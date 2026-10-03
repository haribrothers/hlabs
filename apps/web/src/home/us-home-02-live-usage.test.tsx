// US-HOME-02 · the Live usage widget (phase 4): CPU as a whole percent and memory as used / total, opening Usage.
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderScreen } from '../test/render';
import { LiveUsageWidget } from './live-usage-widget';

const GIB = 1024 ** 3;
const sample = {
  ts: 1,
  host: { cpu: 18.4, memBytes: 9.4 * GIB, memTotalBytes: 16 * GIB, netRx: 0, netTx: 0, diskRead: 0, diskWrite: 0 },
  apps: [],
};

describe('US-HOME-02 · Live usage widget', () => {
  it('shows CPU 18% and Memory 9.4 / 16 GB, and opens Usage', async () => {
    const { router } = renderScreen(LiveUsageWidget, { 'usage.current': () => sample });
    const link = await screen.findByRole('link', { name: /Live usage/ });
    await waitFor(() => expect(link).toHaveTextContent('CPU18%Memory9.4 / 16 GB'));
    fireEvent.click(link);
    await waitFor(() => expect(router.state.location.pathname).toBe('/usage'));
  });
});
