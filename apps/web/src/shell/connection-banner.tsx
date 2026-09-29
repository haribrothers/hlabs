// "You're offline" / "Reconnecting…" (US-STATE-19): a slim strip at the top of every screen, clear of the tab bar
// and window controls. Data stays on screen underneath; when the connection is back the strip goes and every query
// refetches, without a toast.
import { StatusDot } from '@hlabs/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { shellCopy } from '../copy/shell';
import { useConnectionProblem } from '../lib/connection';

export function ConnectionBanner() {
  const problem = useConnectionProblem();
  const queryClient = useQueryClient();
  const previous = useRef(problem);
  useEffect(() => {
    if (previous.current && !problem) void queryClient.invalidateQueries();
    previous.current = problem;
  }, [problem, queryClient]);

  return (
    <div className="pointer-events-none fixed inset-x-4 top-[calc(env(safe-area-inset-top)+0.75rem)] z-50 flex justify-center">
      {/* Always there, so the change is announced. */}
      <div role="status" className="empty:hidden">
        {problem ? (
          <div className="hl-glass hl-glass-3 rounded-pill px-4 py-2 text-body-sm font-semibold">
            <StatusDot status="working">{problem === 'offline' ? shellCopy.offline : shellCopy.reconnecting}</StatusDot>
          </div>
        ) : null}
      </div>
    </div>
  );
}
