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
}

/**
 * A larger panel opened over a window (App settings and Logs over the app window): a light scrim so the window still
 * shows behind, focus trapped, Escape closes, focus returns to what opened it. The panel draws its own frame.
 */
export function ModalPanel({ label, onClose, children, className }: ModalPanelProps) {
  return (
    <RadixDialog.Root open onOpenChange={(open) => (open ? undefined : onClose())}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="hl-scrim hl-scrim-light hl-anim-fade" />
        <RadixDialog.Content aria-describedby={undefined} className={cn('hl-modal-panel', className)}>
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
