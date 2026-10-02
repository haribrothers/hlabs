// shadcn-style DropdownMenu on Radix, themed as the hlabs Menu (level-3 glass, 32px items).
import * as Radix from '@radix-ui/react-dropdown-menu';
import { Check } from '@hlabs/icons';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../lib/cn';

export const DropdownMenu = Radix.Root;
export const DropdownMenuTrigger = Radix.Trigger;
export const DropdownMenuGroup = Radix.Group;

/**
 * Room the navigation takes at the bottom of the screen: the Dock (shelf 79px + 14px off the edge, plus a 12px gap; the
 * app window ends at the same line) or, on a phone, the tab bar (66px + 22px off the edge, plus a gap).
 */
export const NAV_CLEARANCE = { desktop: 105, phone: 100 } as const;
const DESKTOP = '(min-width: 768px)';

/** Keeps a menu clear of the Dock or tab bar: near the bottom it flips above its anchor instead of covering them. */
function navClearance(): number {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return NAV_CLEARANCE.desktop;
  return window.matchMedia(DESKTOP).matches ? NAV_CLEARANCE.desktop : NAV_CLEARANCE.phone;
}

export function DropdownMenuContent({
  className,
  sideOffset = 6,
  collisionPadding,
  ...props
}: ComponentProps<typeof Radix.Content>) {
  return (
    <Radix.Portal>
      <Radix.Content
        sideOffset={sideOffset}
        collisionPadding={collisionPadding ?? { top: 8, right: 8, left: 8, bottom: navClearance() }}
        // hl-menu-layer: above the Dock, the app window and dialogs, so a menu is never drawn under them.
        className={cn('hl-menu hl-menu-layer hl-glass hl-glass-3 hl-anim-menu', className)}
        {...props}
      />
    </Radix.Portal>
  );
}

export function DropdownMenuItem({
  className,
  danger,
  icon,
  shortcut,
  children,
  ...props
}: ComponentProps<typeof Radix.Item> & { danger?: boolean; icon?: ReactNode; shortcut?: string }) {
  return (
    <Radix.Item className={cn('hl-menu-item', danger && 'hl-menu-danger', className)} {...props}>
      {icon ? (
        <span className="hl-menu-icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span className="hl-menu-label">{children}</span>
      {shortcut ? <kbd className="hl-menu-kbd">{shortcut}</kbd> : null}
    </Radix.Item>
  );
}

export function DropdownMenuCheckboxItem({ className, children, ...props }: ComponentProps<typeof Radix.CheckboxItem>) {
  return (
    <Radix.CheckboxItem className={cn('hl-menu-item', className)} {...props}>
      <span className="hl-menu-check" aria-hidden="true">
        <Radix.ItemIndicator>
          <Check size={14} strokeWidth={2} />
        </Radix.ItemIndicator>
      </span>
      <span className="hl-menu-label">{children}</span>
    </Radix.CheckboxItem>
  );
}

/** A heading at the top of a menu: the app a tile's menu is for (US-HOME-07). */
export function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof Radix.Label>) {
  return <Radix.Label className={cn('hl-menu-header', className)} {...props} />;
}

export function DropdownMenuSeparator({ className, ...props }: ComponentProps<typeof Radix.Separator>) {
  return <Radix.Separator className={cn('hl-menu-sep', className)} {...props} />;
}
