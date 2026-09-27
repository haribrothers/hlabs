import { Check } from '@hlabs/icons';
import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface MenuItem {
  label?: ReactNode;
  icon?: ReactNode;
  shortcut?: string;
  detail?: string;
  href?: string;
  onSelect?: () => void;
  checked?: boolean;
  disabled?: boolean;
  /** Destructive: goes last, in danger. */
  danger?: boolean;
  submenu?: boolean;
  separator?: boolean;
}

export interface MenuProps {
  label: string;
  items: MenuItem[];
  width?: number;
  header?: ReactNode;
  className?: string;
}

const MENU_WIDTH = 240;

/** A menu surface with arrow-key movement. For a positioned dropdown use DropdownMenu. */
export function Menu({ label, items, width = MENU_WIDTH, header, className }: MenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const hasChecks = items.some((it) => it.checked !== undefined);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
    if (!keys.includes(e.key)) return;
    const els = Array.from(
      ref.current?.querySelectorAll<HTMLElement>('.hl-menu-item:not([aria-disabled="true"])') ?? [],
    );
    if (!els.length) return;
    const i = els.indexOf(document.activeElement as HTMLElement);
    const n =
      e.key === 'ArrowDown'
        ? i + 1
        : e.key === 'ArrowUp'
          ? i < 0
            ? els.length - 1
            : i - 1
          : e.key === 'Home'
            ? 0
            : els.length - 1;
    els[(n + els.length) % els.length]?.focus();
    e.preventDefault();
  };

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      className={cn('hl-menu hl-glass hl-glass-3', className)}
      style={{ width }}
      onKeyDown={onKeyDown}
    >
      {header}
      {items.map((it, i) => {
        if (it.separator) return <div key={i} role="separator" className="hl-menu-sep" />;
        const common = {
          role: it.checked !== undefined ? 'menuitemcheckbox' : 'menuitem',
          'aria-checked': it.checked !== undefined ? it.checked : undefined,
          'aria-disabled': it.disabled || undefined,
          'aria-haspopup': it.submenu ? ('menu' as const) : undefined,
          className: cn('hl-menu-item', it.danger && 'hl-menu-danger'),
          tabIndex: -1,
          onClick: it.disabled ? undefined : it.onSelect,
        };
        const inner = (
          <>
            {hasChecks ? (
              <span className="hl-menu-check" aria-hidden="true">
                {it.checked ? <Check size={14} strokeWidth={2} /> : null}
              </span>
            ) : null}
            {it.icon ? (
              <span className="hl-menu-icon" aria-hidden="true">
                {it.icon}
              </span>
            ) : null}
            <span className="hl-menu-label">{it.label}</span>
            {it.shortcut ? (
              <kbd className="hl-menu-kbd">{it.shortcut}</kbd>
            ) : it.submenu ? (
              <span className="hl-menu-kbd" aria-hidden="true">
                ›
              </span>
            ) : it.detail ? (
              <span className="hl-menu-kbd">{it.detail}</span>
            ) : null}
          </>
        );
        return it.href ? (
          <a key={i} href={it.disabled ? undefined : it.href} {...common}>
            {inner}
          </a>
        ) : (
          <button key={i} type="button" {...common}>
            {inner}
          </button>
        );
      })}
    </div>
  );
}
