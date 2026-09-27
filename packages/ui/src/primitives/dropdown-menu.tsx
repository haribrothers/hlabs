// shadcn-style DropdownMenu on Radix, themed as the hlabs Menu (level-3 glass, 32px items).
import * as Radix from '@radix-ui/react-dropdown-menu';
import { Check } from '@hlabs/icons';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../lib/cn';

export const DropdownMenu = Radix.Root;
export const DropdownMenuTrigger = Radix.Trigger;
export const DropdownMenuGroup = Radix.Group;

export function DropdownMenuContent({ className, sideOffset = 6, ...props }: ComponentProps<typeof Radix.Content>) {
  return (
    <Radix.Portal>
      <Radix.Content
        sideOffset={sideOffset}
        className={cn('hl-menu hl-glass hl-glass-3 hl-anim-menu', className)}
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

export function DropdownMenuSeparator({ className, ...props }: ComponentProps<typeof Radix.Separator>) {
  return <Radix.Separator className={cn('hl-menu-sep', className)} {...props} />;
}
