import { LogoMark } from '@hlabs/icons';
import { Menu, type MenuItem } from './menu';
import { StatusDot, type Status } from './status-dot';

export interface TrayMenuProps {
  status?: Status;
  statusText: string;
  /** CPU, memory, free space. */
  stats?: { label: string; value: string }[];
  items: MenuItem[];
  width?: number;
}

const TRAY_WIDTH = 300;
const TRAY_LOGO = 20;

/** The Mac menu-bar dropdown (the Tauri tray window). */
export function TrayMenu({ status = 'running', statusText, stats, items, width = TRAY_WIDTH }: TrayMenuProps) {
  const header = (
    <div className="hl-tray-head">
      <span className="hl-tray-logo">
        <LogoMark size={TRAY_LOGO} title="" simplified={false} />
      </span>
      <span className="hl-tray-id">
        <b>hlabs</b>
        <StatusDot status={status}>{statusText}</StatusDot>
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
  );
  return <Menu label="hlabs" width={width} header={header} items={items} />;
}
