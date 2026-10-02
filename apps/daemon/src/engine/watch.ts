// What happens when the container engine stops or comes back (US-STATE-08, US-STATE-10). Stopping tells the admins
// once ("The container engine has stopped", never again on each 10 s retry while it's still unread); coming back
// marks that read and brings apps set to start automatically back (02 §2.3 step 4).
import type { EventBus } from '../events/bus';
import type { NotificationService } from '../notifications/service';
import type { EngineService } from './service';

export const ENGINE_STOPPED_KIND = 'engine_stopped';

export function watchEngine(deps: {
  bus: EventBus;
  engine: Pick<EngineService, 'status' | 'lastCandidate'>;
  notifications: Pick<NotificationService, 'create' | 'markKindRead' | 'hasUnread'>;
  /** Reconciles the apps with the engine that's back. */
  appsBack: () => Promise<void>;
  /** No notification before setup is done: there's no one to tell yet, and setup handles the engine itself. */
  setUp: () => boolean;
}): void {
  let running = deps.engine.status.state === 'running';
  deps.bus.on(({ event }) => {
    if (event.type !== 'engine.status') return;
    const was = running;
    running = event.data.running;
    if (!running) {
      // No engine was ever found: that's engine setup (US-ONB-05), not an engine that stopped.
      if (!deps.engine.lastCandidate || !deps.setUp() || deps.notifications.hasUnread(ENGINE_STOPPED_KIND)) return;
      deps.notifications.create({
        userId: null,
        kind: ENGINE_STOPPED_KIND,
        severity: 'critical',
        title: 'The container engine has stopped',
        body: 'All apps are offline. Your data is safe.',
        actions: [{ kind: 'navigate', to: '/settings/engine' }],
      });
    } else if (!was) {
      deps.notifications.markKindRead(ENGINE_STOPPED_KIND);
      void deps.appsBack();
    }
  });
}
