// The search panel's frame (Spotlight, US-HOME-09): level-3 glass, centred near the top, over a scrim. Focus is
// trapped inside, Escape closes it, and focus goes back to whatever had it when it opened.
import * as RadixDialog from '@radix-ui/react-dialog';
import { useRef, type ReactNode, type RefObject } from 'react';

export interface CommandPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Names the dialog for screen readers: "Search". */
  label: string;
  /** Where focus goes when it opens (the search field). */
  initialFocus?: RefObject<HTMLElement | null>;
  children: ReactNode;
}

export function CommandPanel({ open, onOpenChange, label, initialFocus, children }: CommandPanelProps) {
  const returnTo = useRef<HTMLElement | null>(null);
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="hl-scrim hl-anim-fade" />
        <RadixDialog.Content
          aria-label={label}
          aria-describedby={undefined}
          className="hl-command hl-glass hl-glass-3 hl-anim-command"
          onOpenAutoFocus={(e) => {
            returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
            if (!initialFocus?.current) return;
            e.preventDefault();
            initialFocus.current.focus();
          }}
          onCloseAutoFocus={(e) => {
            if (!returnTo.current?.isConnected) return;
            e.preventDefault();
            returnTo.current.focus();
          }}
        >
          <RadixDialog.Title className="sr-only">{label}</RadixDialog.Title>
          {children}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
