import * as RadixDialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface ModalPanelProps {
  /** Names the dialog for screen readers ("App settings"); the panel shows its own heading. */
  label: string;
  /** Escape and the panel's own close buttons call this. */
  onClose: () => void;
  /** The panel itself (its own glass card), centred over the scrim; the area around it scrolls. */
  children: ReactNode;
  className?: string;
  /** 'strong' dims and blurs everything behind (a file preview); 'light' keeps the window showing. Default 'light'. */
  scrim?: 'light' | 'strong';
  /** Where focus goes when it closes, when not back to what opened it. */
  finalFocus?: () => HTMLElement | null;
}

/**
 * A larger panel opened over a window (App settings and Logs over the app window): a light scrim so the window still
 * shows behind, focus trapped, Escape closes, focus returns to what opened it. The panel draws its own frame.
 */
export function ModalPanel({ label, onClose, children, className, scrim = 'light', finalFocus }: ModalPanelProps) {
  return (
    <RadixDialog.Root open onOpenChange={(open) => (open ? undefined : onClose())}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className={cn('hl-scrim hl-anim-fade', scrim === 'light' && 'hl-scrim-light')} />
        <RadixDialog.Content
          aria-describedby={undefined}
          className={cn('hl-modal-panel', className)}
          // A toast over the dialog (`data-hl-toasts`) can be pressed without closing it.
          onPointerDownOutside={(e) => {
            if ((e.target as Element | null)?.closest?.('[data-hl-toasts]')) e.preventDefault();
          }}
          onCloseAutoFocus={(e) => {
            const to = finalFocus?.();
            if (!to?.isConnected) return;
            e.preventDefault();
            to.focus();
          }}
        >
          {/* Names the dialog without a second heading: the panel has its own. */}
          <RadixDialog.Title asChild>
            <span className="sr-only">{label}</span>
          </RadixDialog.Title>
          {children}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
