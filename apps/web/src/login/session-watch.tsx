// The signed-in event stream: signed out right away when this device's session is revoked elsewhere (US-AUTH-15;
// the daemon sends `session.revoked` on this session's own stream), and notifications as toasts (US-STATE-16).
// One subscription for both, so each tab holds one connection.
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { useSubscription } from '@trpc/tanstack-react-query';
import { useState } from 'react';
import { loginCopy } from '../copy/login';
import { setCsrfToken } from '../lib/csrf';
import { NotificationFeed } from '../lib/notification-feed';
import { useReconnectWhenVisible } from '../lib/stream-status';
import { dismissNotificationToasts, showToast } from '../lib/toasts';
import { useTRPC, useTRPCClient } from '../lib/trpc';

/** Set while this tab logs out itself, so it doesn't also say it was logged out (US-AUTH-16). */
let loggingOut = false;
export const setLoggingOut = (value: boolean) => {
  loggingOut = value;
};

export function useSignedOutHere() {
  const queryClient = useQueryClient();
  const router = useRouter();
  return async () => {
    setCsrfToken(null);
    queryClient.clear();
    await router.navigate({ to: '/login' });
    if (!loggingOut) showToast({ tone: 'warning', title: loginCopy.loggedOutHere });
  };
}

export function SessionWatch() {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const signedOut = useSignedOutHere();
  useReconnectWhenVisible();
  const [feed] = useState(
    () =>
      new NotificationFeed({
        show: showToast,
        hide: dismissNotificationToasts,
        fetchSince: async (since) => (await client.notifications.list.query({ since, limit: 50 })).items,
      }),
  );
  useSubscription(
    trpc.events.stream.subscriptionOptions(
      { types: ['session.revoked', 'notification.created', 'notification.read'] },
      {
        onStarted: () => void feed.onConnected(),
        onConnectionStateChange: (state) => {
          if (state.state === 'pending') void feed.onConnected();
          else feed.onDisconnected();
        },
        onData: (envelope) => {
          const event = envelope.data;
          if (event.type === 'session.revoked') void signedOut();
          else if (event.type === 'notification.created') feed.onCreated(event);
          else if (event.type === 'notification.read') feed.onRead(event);
        },
      },
    ),
  );
  return null;
}
