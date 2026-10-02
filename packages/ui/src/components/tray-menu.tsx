import { iconDefaults, LogoMark, TriangleAlert } from '@hlabs/icons';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { Button } from './button';
import { Menu, type MenuItem } from './menu';
import { StatusDot, type Status } from './status-dot';

export interface TrayMenuProps {
  status?: Status;
  statusText: string;
  /** 'danger' for the error states (TrayStates "Error"): a warning in place of the logo, the status in danger. */
  tone?: 'default' | 'danger';
  /** CPU, memory, free space. */
  stats?: { label: string; value: string }[];
  /** A short explanation under the header (Paused, Error and Update states). */
  note?: { title?: string; body: ReactNode };
  /** The state's one primary button ("Resume apps", "Start engine", "Try again"…). */
  action?: { label: string; onSelect: () => void; busy?: boolean; disabled?: boolean };
  items: MenuItem[];
  width?: number;
}

const TRAY_WIDTH = 300;
const TRAY_LOGO = 20;

/** The Mac menu-bar dropdown (the Tauri tray window). */
export function TrayMenu({
  status = 'running',
  statusText,
  tone = 'default',
  stats,
  note,
  action,
  items,
  width = TRAY_WIDTH,
}: TrayMenuProps) {
  const danger = tone === 'danger';
  const header = (
    <>
      <div className="hl-tray-head">
        <span className={cn('hl-tray-logo', danger && 'hl-tray-logo-danger')}>
          {danger ? (
            <TriangleAlert aria-hidden {...iconDefaults} />
          ) : (
            <LogoMark size={TRAY_LOGO} title="" simplified={false} />
          )}
        </span>
        <span className="hl-tray-id">
          <b>hlabs</b>
          {danger ? (
            <span className="hl-tray-status-danger">{statusText}</span>
          ) : (
            <StatusDot status={status}>{statusText}</StatusDot>
          )}
        </span>
        {stats ? (
          <span className="hl-tray-stats">
            {stats.map((s) => (
              <span key={s.label} className="hl-tray-stat">
                <span>{s.label}</span>
                <b>{s.value}</b>
              </span>
            ))}
          </span>
        ) : null}
      </div>
      {note || action ? (
        <div className="hl-tray-body">
          {note ? (
            <div className={cn('hl-tray-note', danger && 'hl-tray-note-danger')} role={danger ? 'alert' : undefined}>
              {note.title ? <b>{note.title}</b> : null}
              <span>{note.body}</span>
            </div>
          ) : null}
          {action ? (
            <Button className="hl-tray-action" onClick={action.onSelect} busy={action.busy} disabled={action.disabled}>
              {action.label}
            </Button>
          ) : null}
        </div>
      ) : null}
    </>
  );
  return <Menu label="hlabs" width={width} header={header} items={items} />;
}
