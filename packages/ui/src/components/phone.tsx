// The phone layout's building blocks (D-172, Direction A · Native iOS-like): a large title that collapses into a
// compact centred title as the page scrolls, a back button named after where you came from, inset grouped lists with
// 44–48px rows and 17px text, the search field, section headings and the small pill buttons of App Store rows.
// Only the phone layout (< 768px) uses them; the desktop is unchanged.
import { ChevronLeft, ChevronRight, iconDefaults, Search, X } from '@hlabs/icons';
import * as RadixDialog from '@radix-ui/react-dialog';
import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
} from 'react';
import { cn } from '../lib/cn';

/**
 * Whether `el` has scrolled out of view under the compact bar. Uses the viewport, so it works for the page's own
 * scroller (`<main>`) as well as the window.
 */
function useScrolledPast(el: React.RefObject<HTMLElement | null>): boolean {
  const [past, setPast] = useState(false);
  useEffect(() => {
    const node = el.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setPast(entry ? !entry.isIntersecting : false), {
      rootMargin: '-44px 0px 0px 0px',
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [el]);
  return past;
}

export interface PhoneBack {
  /** Where you came from: "App Store", "Settings", "Log in". */
  label: string;
  onBack: () => void;
}

export interface PhoneHeaderProps {
  /** The screen's title: large (34px) on top-level screens, compact on pushed ones. */
  title: ReactNode;
  /** A plain-text title for the compact bar (when `title` isn't a string). */
  compactTitle?: string;
  /** Under the large title: Home's greeting, a category's count. */
  subtitle?: ReactNode;
  /** Beside the large title (Home's notifications and account buttons). */
  trailing?: ReactNode;
  /** A pushed screen: the back button in its bar. */
  back?: PhoneBack;
  /** At the right of a pushed screen's bar (Share, Search). */
  barTrailing?: ReactNode;
  /** False: no large title in the page (App details shows the app instead); the compact title shows on scroll. */
  large?: boolean;
  /** The large title's id and ref (a section that moves focus to its heading when it opens). */
  titleId?: string;
  titleRef?: Ref<HTMLHeadingElement>;
  className?: string;
}

/** The back button: "‹ App Store", in the link colour, 44px tall. */
export function PhoneBackButton({ label, onBack, className }: PhoneBack & { className?: string }) {
  return (
    <button type="button" className={cn('hl-p-back hl-focus', className)} onClick={onBack}>
      <ChevronLeft aria-hidden {...iconDefaults} className="hl-p-back-chevron" />
      {label}
    </button>
  );
}

/**
 * A phone screen's header (D-172): the back row of a pushed screen, the large title and what goes beside or under
 * it; once the title scrolls away a compact bar stays at the top with the title centred (and the back button).
 */
export function PhoneHeader({
  title,
  compactTitle,
  subtitle,
  trailing,
  back,
  barTrailing,
  large = true,
  titleId,
  titleRef,
  className,
}: PhoneHeaderProps) {
  const sentinel = useRef<HTMLDivElement>(null);
  const collapsed = useScrolledPast(sentinel);
  const short = compactTitle ?? (typeof title === 'string' ? title : undefined);
  return (
    <header className={cn('hl-p-header', className)}>
      <div className="hl-p-bar" data-collapsed={collapsed || undefined} aria-hidden={!collapsed}>
        <span className="hl-p-bar-side">{back ? <PhoneBackButton {...back} /> : null}</span>
        <span className="hl-p-bar-title">{short}</span>
        <span className="hl-p-bar-side hl-p-bar-end">{barTrailing}</span>
      </div>
      {back || barTrailing ? (
        <div className="hl-p-nav">
          {back ? <PhoneBackButton {...back} /> : <span />}
          {barTrailing ? <span className="hl-p-bar-end">{barTrailing}</span> : null}
        </div>
      ) : null}
      {large ? (
        <div className="hl-p-title-row">
          <h1 id={titleId} ref={titleRef} tabIndex={titleRef ? -1 : undefined} className="hl-p-large outline-none">
            {title}
          </h1>
          {trailing ? <div className="hl-p-title-trailing">{trailing}</div> : null}
        </div>
      ) : null}
      {subtitle ? <div className="hl-p-subtitle">{subtitle}</div> : null}
      <div ref={sentinel} aria-hidden className="hl-p-sentinel" />
    </header>
  );
}

/** A section heading over a list or a row of cards: "Apps", "Featured", "Popular", with an optional link. */
export function PhoneSection({
  title,
  action,
  id,
  className,
}: {
  title: ReactNode;
  action?: ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <div className={cn('hl-p-sec', className)}>
      <h2 id={id}>{title}</h2>
      {action}
    </div>
  );
}

/** An inset grouped list (D-172): a rounded box of rows, with an optional label above and a note under it. */
export function InsetGroup({
  label,
  footer,
  children,
  className,
  labelId,
  as = 'div',
}: {
  label?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  labelId?: string;
  as?: 'div' | 'ul';
}) {
  const Box = as;
  return (
    <section className={cn('hl-p-group-wrap', className)} aria-labelledby={label && labelId ? labelId : undefined}>
      {label ? (
        <h2 className="hl-p-label" id={labelId}>
          {label}
        </h2>
      ) : null}
      <Box className="hl-p-group">{children}</Box>
      {footer ? <p className="hl-p-foot">{footer}</p> : null}
    </section>
  );
}

export interface InsetRowProps {
  /** The 30px icon square's glyph (an area's Dock colour with `tone`). */
  icon?: ReactNode;
  /** The icon square's background: an area's Dock colour (`--dock-backups` …); the control colour otherwise. */
  tone?: 'backups' | 'usage' | 'store' | 'files' | 'settings';
  /** Something other than an icon square at the start: an avatar, an app logo. */
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /** At the right, in the faint colour: "2 hours ago", "142 GB free". */
  value?: ReactNode;
  /** A control or a badge at the right. */
  trailing?: ReactNode;
  /** A chevron: the row leads somewhere. */
  chevron?: boolean;
  /** Red text (Uninstall…). */
  danger?: boolean;
  /** Link colour (Use a recovery code). */
  accent?: boolean;
  className?: string;
}

/** The inside of a row; put it in a <button>, a link, or <InsetRow> for a plain one. */
export function InsetRowContent({
  icon,
  tone,
  leading,
  title,
  subtitle,
  value,
  trailing,
  chevron,
}: Omit<InsetRowProps, 'className' | 'danger' | 'accent'>) {
  return (
    <>
      {leading ??
        (icon ? (
          <span aria-hidden className="hl-p-sq" data-tone={tone}>
            {icon}
          </span>
        ) : null)}
      <span className="hl-p-row-main">
        <span className="hl-p-row-text">
          <span className="hl-p-row-title">{title}</span>
          {subtitle ? <span className="hl-p-row-sub">{subtitle}</span> : null}
        </span>
        {value !== undefined && value !== null ? <span className="hl-p-row-value">{value}</span> : null}
        {trailing}
        {chevron ? (
          <span aria-hidden className="hl-p-chev">
            <ChevronRight {...iconDefaults} />
          </span>
        ) : null}
      </span>
    </>
  );
}

/** A row that isn't a control itself (it may hold one: a switch, a Copy button). */
export function InsetRow({ className, danger, accent, ...content }: InsetRowProps) {
  return (
    <div className={cn('hl-p-row', danger && 'hl-p-row-danger', accent && 'hl-p-row-accent', className)}>
      <InsetRowContent {...content} />
    </div>
  );
}

/** A row that is a button. */
export const InsetRowButton = forwardRef<
  HTMLButtonElement,
  InsetRowProps & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'title'>
>(function InsetRowButton(
  { className, danger, accent, icon, tone, leading, title, subtitle, value, trailing, chevron, ...button },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      className={cn('hl-p-row hl-focus', danger && 'hl-p-row-danger', accent && 'hl-p-row-accent', className)}
      {...button}
    >
      <InsetRowContent {...{ icon, tone, leading, title, subtitle, value, trailing, chevron }} />
    </button>
  );
});

/** Class names for a row that's a router link (apps pass them to their own <Link>). */
export const insetRowClass = (opts: { danger?: boolean; accent?: boolean } = {}) =>
  cn('hl-p-row hl-focus', opts.danger && 'hl-p-row-danger', opts.accent && 'hl-p-row-accent');

export interface PhoneSearchFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** The field's accessible name ("Search apps"); the placeholder can say more ("Search 100 apps"). */
  label: string;
  /** Shows "✕" while there's text, which empties the field. */
  onClear?: () => void;
  clearLabel?: string;
}

/** The search field (44px, 17px text): App Store, Search. Its text is 17px so iOS doesn't zoom into it. */
export const PhoneSearchField = forwardRef<HTMLInputElement, PhoneSearchFieldProps>(function PhoneSearchField(
  { label, onClear, clearLabel = 'Clear', className, value, ...input },
  ref,
) {
  return (
    <div className={cn('hl-p-search', className)}>
      <Search aria-hidden {...iconDefaults} className="hl-p-search-glyph" />
      <input
        ref={ref}
        type="search"
        aria-label={label}
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        value={value}
        {...input}
      />
      {onClear && value ? (
        <button type="button" className="hl-p-search-clear hl-focus" aria-label={clearLabel} onClick={onClear}>
          <X aria-hidden {...iconDefaults} />
        </button>
      ) : null}
    </div>
  );
});

/**
 * The small pill of an App Store row: "Install", "Open", or a state ("Installing… 42%"). A 44px hit area around a
 * 30px pill.
 */
export const PillButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(function PillButton(
  { className, children, ...button },
  ref,
) {
  return (
    <button ref={ref} type="button" className={cn('hl-p-get hl-focus', className)} {...button}>
      <span>{children}</span>
    </button>
  );
});

/** Page dots under a row you swipe sideways (Home's widgets): decorative, the row itself is the control. */
export function PageDots({ count, current }: { count: number; current: number }) {
  if (count < 2) return null;
  return (
    <div aria-hidden className="hl-p-dots">
      {Array.from({ length: count }, (_, i) => (
        <span key={i} data-current={i === current || undefined} />
      ))}
    </div>
  );
}

/**
 * A layer over a blurred, dimmed page for a phone's context menu (a tile's menu, US-PHONE-08): focus trapped, Escape
 * and a tap outside close it, the page behind stays still. Its content places itself.
 */
export function PhoneMenuLayer({
  open,
  onOpenChange,
  label,
  onOpenAutoFocus,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Names the layer for screen readers (the app). */
  label: string;
  onOpenAutoFocus?: (e: Event) => void;
  children: ReactNode;
}) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="hl-p-menu-scrim hl-anim-fade" />
        <RadixDialog.Content
          aria-describedby={undefined}
          className="hl-p-menu-layer"
          onOpenAutoFocus={onOpenAutoFocus}
          onPointerDownOutside={() => onOpenChange(false)}
        >
          <RadixDialog.Title className="sr-only">{label}</RadixDialog.Title>
          {children}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
