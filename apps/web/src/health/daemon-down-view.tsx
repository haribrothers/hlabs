// SysDaemonDown, "Can't reach hlabs" (US-STATE-04…06): the same view in the dashboard and on the fallback page
// Caddy serves when the daemon doesn't answer. Try now comes first in the tab order.
import { WifiOff, iconDefaults } from '@hlabs/icons';
import { Button, GlassCard } from '@hlabs/ui';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { healthCopy, reasonLine } from '../copy/health';
import type { DaemonDownController } from './daemon-down';

const copy = healthCopy;

function CopyCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="hl-focus rounded-xs bg-transparent px-1 text-caption text-ink-muted underline"
      onClick={() =>
        void navigator.clipboard?.writeText(command).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2_000);
        })
      }
    >
      {copied ? copy.copied : copy.copyCommand}
    </button>
  );
}

export function DaemonDownView({
  controller,
  checkAtOnce = false,
}: {
  controller: DaemonDownController;
  /** The fallback page checks at once to learn why hlabs is down. */
  checkAtOnce?: boolean;
}) {
  const state = useSyncExternalStore(
    (l) => controller.subscribe(l),
    () => controller.snapshot,
  );
  // Try now is disabled while it checks, which drops focus; give it back afterwards so Enter or Space works again.
  const tryNow = useRef<HTMLButtonElement>(null);
  const refocus = useRef(false);
  useEffect(() => {
    if (state.checking || !refocus.current) return;
    refocus.current = false;
    tryNow.current?.focus();
  }, [state.checking]);
  useEffect(() => {
    controller.start({ now: checkAtOnce });
    return () => controller.stop();
  }, [controller, checkAtOnce]);

  return (
    <main className="hl-wall flex min-h-full flex-col items-center justify-center gap-5 px-4 py-10 text-center">
      <span className="grid size-20 place-items-center rounded-pill border border-glass bg-surface-control text-warning">
        <WifiOff aria-hidden {...iconDefaults} />
      </span>
      <div className="flex flex-col gap-2">
        <h1 className="m-0 text-display">{copy.title}</h1>
        {/* Why, when hlabs knows (US-STATE-05); announced when it changes, not the countdown. */}
        <p aria-live="polite" className="m-0 max-w-lg text-body empty:hidden">
          {reasonLine(state.reason)}
        </p>
        <p className="m-0 text-body text-ink-muted">
          {state.checking ? copy.trying : copy.tryingIn(state.secondsLeft)}
        </p>
      </div>
      <Button
        ref={tryNow}
        size="lg"
        className="order-last"
        busy={state.checking}
        onClick={(event) => {
          refocus.current = document.activeElement === event.currentTarget;
          controller.tryNow();
        }}
      >
        {copy.tryNow}
      </Button>
      {/* While hlabs is starting there's nothing to check. */}
      {state.reason === 'starting' ? null : (
        <GlassCard className="w-full max-w-lg p-0 text-left">
          <ol aria-label={copy.checksLabel} className="m-0 list-none p-0">
            {[...copy.checks, null].map((check, i) => (
              <li key={i} className="flex gap-3 border-t border-hairline px-4 py-3 first:border-t-0">
                <span
                  aria-hidden="true"
                  className="grid size-6 shrink-0 place-items-center rounded-pill bg-surface-control text-caption font-semibold"
                >
                  {i + 1}
                </span>
                <span className="min-w-0 text-body-sm">
                  {check ?? (
                    <>
                      {copy.linuxCheck}{' '}
                      <code className="rounded-xs bg-surface-input px-1.5 py-0.5 font-mono text-mono break-all">
                        {copy.linuxCommand}
                      </code>{' '}
                      <CopyCommand command={copy.linuxCommand} />
                    </>
                  )}
                </span>
              </li>
            ))}
          </ol>
        </GlassCard>
      )}
    </main>
  );
}
