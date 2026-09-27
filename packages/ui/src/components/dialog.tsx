import * as RadixDialog from '@radix-ui/react-dialog';
import { useId, useRef, type CSSProperties, type ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface DialogProps {
  /** A question or outcome: "Uninstall Jellyfin?" */
  title: ReactNode;
  /** What happens to the person's data. */
  children?: ReactNode;
  /** Buttons, right-aligned; primary (or destructive) last. */
  actions?: ReactNode;
  /** 'alertdialog' for destructive confirmations. */
  role?: 'dialog' | 'alertdialog';
  width?: CSSProperties['width'];
  className?: string;
}

/** The dialog frame on level-3 glass. Use <ModalDialog> for a real modal with scrim, focus trap and Escape. */
export function Dialog({ title, children, actions, role = 'dialog', width, className }: DialogProps) {
  const titleId = useId();
  return (
    <section
      role={role}
      aria-labelledby={titleId}
      className={cn('hl-dialog hl-glass hl-glass-3', className)}
      style={width ? { width } : undefined}
    >
      <h2 id={titleId} className="hl-dialog-title">
        {title}
      </h2>
      {children ? <div className="hl-dialog-body">{children}</div> : null}
      {actions ? <div className="hl-dialog-actions">{actions}</div> : null}
    </section>
  );
}

export interface ModalDialogProps extends Omit<DialogProps, 'className'> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Keep the dialog open on Escape and outside clicks (e.g. while a job runs). */
  dismissible?: boolean;
}

/** A modal dialog (Radix): scrim-strong behind, focus trapped, Escape closes, focus returns to the trigger. */
export function ModalDialog({
  open,
  onOpenChange,
  dismissible = true,
  title,
  children,
  actions,
  role = 'dialog',
  width,
}: ModalDialogProps) {
  // Radix only restores focus to a Dialog.Trigger; remember whatever opened the dialog instead.
  const returnTo = useRef<HTMLElement | null>(null);
  const block = (e: Event) => {
    if (!dismissible) e.preventDefault();
  };
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="hl-scrim hl-anim-fade" />
        <RadixDialog.Content
          role={role}
          aria-describedby={undefined}
          className="hl-dialog hl-dialog-modal hl-glass hl-glass-3 hl-anim-dialog"
          style={width ? { width } : undefined}
          onOpenAutoFocus={() => {
            returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          }}
          onCloseAutoFocus={(e) => {
            if (!returnTo.current?.isConnected) return;
            e.preventDefault();
            returnTo.current.focus();
          }}
          onEscapeKeyDown={block}
          onPointerDownOutside={block}
          onInteractOutside={block}
        >
          <RadixDialog.Title className="hl-dialog-title">{title}</RadixDialog.Title>
          {children ? <div className="hl-dialog-body">{children}</div> : null}
          {actions ? <div className="hl-dialog-actions">{actions}</div> : null}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

export const DialogClose = RadixDialog.Close;
