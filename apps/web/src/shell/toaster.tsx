// Where toasts show: bottom-right on a desktop, above the tab bar on a phone (US-STATE-14). Hovering or focusing
// one holds it; it goes on once the pointer and focus have both left.
import { Toast } from '@hlabs/ui';
import { Link } from '@tanstack/react-router';
import { dismissToast, pauseToast, resumeToast, useToasts } from '../lib/toasts';

export function Toaster() {
  const toasts = useToasts();
  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-24 z-50 flex flex-col items-end gap-2 sm:inset-x-auto sm:right-6 sm:bottom-6">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto w-full sm:w-auto"
          onMouseEnter={() => pauseToast(t.id, 'hover')}
          onMouseLeave={() => resumeToast(t.id, 'hover')}
          onFocus={() => pauseToast(t.id, 'focus')}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) resumeToast(t.id, 'focus');
          }}
        >
          <Toast
            tone={t.tone}
            title={t.title}
            leaving={t.leaving}
            onDismiss={() => dismissToast(t.id)}
            action={
              t.action ? (
                <Link
                  to={t.action.to}
                  onClick={() => dismissToast(t.id)}
                  className="hl-btn hl-btn-link hl-focus self-start"
                >
                  {t.action.label}
                </Link>
              ) : undefined
            }
          >
            {t.body}
          </Toast>
        </div>
      ))}
    </div>
  );
}
