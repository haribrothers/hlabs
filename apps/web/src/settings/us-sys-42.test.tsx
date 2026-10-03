// US-SYS-42 · See why hlabs can't serve its address (the dashboard): the admins' notification is a danger toast that
// stays, with "Change port" (Settings › Network); members never get its button.
import { describe, expect, it } from 'vitest';
import { toastFromNotification } from '../lib/notification-feed';
import { visibleActions } from '../lib/toast-actions';
import { SEVERITY_TONE, TOAST_MS } from '../lib/toasts';

describe('US-SYS-42', () => {
  it('"hlabs can\'t use port 443" stays until dismissed, with "Change port"', () => {
    const toast = toastFromNotification({
      notificationId: 'n1',
      userId: null,
      kind: 'network.port_in_use',
      target: '443',
      severity: 'critical',
      title: "hlabs can't use port 443",
      body: "Tailscale Serve is using it, so other devices can't reach hlabs. Use port 8443 instead, or turn off that Serve entry.",
      actions: [{ kind: 'navigate', to: '/settings/network' }],
      createdAt: 1,
    } as never);
    expect(toast.tone).toBe(SEVERITY_TONE.critical);
    expect(TOAST_MS[toast.tone]).toBeNull();
    expect(visibleActions(toast.actions, { isAdmin: true, shippedPhase: 4 })).toEqual([
      { kind: 'navigate', to: '/settings/network', label: 'Change port', admin: true, feature: 'remoteAccess' },
    ]);
    expect(visibleActions(toast.actions, { isAdmin: false, shippedPhase: 4 })).toEqual([]);
  });
});
