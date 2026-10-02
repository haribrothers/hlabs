import { Check, Circle, iconDefaults, LoaderCircle, LogoMark, TriangleAlert } from '@hlabs/icons';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { Button } from './button';
import { Menu, type MenuItem } from './menu';
import { Progress } from './progress';
import { StatusDot, type Status } from './status-dot';

export interface TrayMenuProps {
  status?: Status;
  statusText: string;
  /** 'danger' for the error states (TrayStates "Error"): a warning in place of the logo, the status in danger. */
  tone?: 'default' | 'danger';
  /** CPU, memory, free space. `spoken` replaces both for screen readers ("CPU usage 18 percent"). */
  stats?: { label: string; value: string; spoken?: string }[];
  /** A short explanation under the header (Paused, Error and Update states). */
  note?: { title?: string; body: ReactNode };
  /** Determinate progress under the header, 0–1 (Starting: apps running of those that should run). */
  progress?: { value: number; label: string };
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
  progress,
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
                <span aria-hidden={s.spoken ? true : undefined}>{s.label}</span>
                <b aria-hidden={s.spoken ? true : undefined}>{s.value}</b>
                {s.spoken ? <span className="hl-sr">{s.spoken}</span> : null}
              </span>
            ))}
          </span>
        ) : null}
      </div>
      {progress ? (
        <Progress
          value={progress.value * 100}
          aria-label={progress.label}
          className={cn('hl-tray-progress', status === 'working' && 'hl-tray-progress-working')}
        />
      ) : null}
      {note || action ? (
        <div className="hl-tray-body">
          {note ? (
            <div className={cn('hl-tray-note', danger && 'hl-tray-note-danger')} role={danger ? 'alert' : undefined}>
              {note.title ? <b>{note.title}</b> : null}
              <span>{note.body}</span>
            </div>
          ) : null}
          {action ? (
            <Button
              size="sm"
              className="hl-tray-action"
              onClick={action.onSelect}
              busy={action.busy}
              disabled={action.disabled}
            >
              {action.label}
            </Button>
          ) : null}
        </div>
      ) : null}
    </>
  );
  return <Menu label="hlabs" width={width} header={header} items={items} />;
}

export type TraySetupStepState = 'done' | 'working' | 'pending';

export interface TraySetupProps {
  title: string;
  subtitle: string;
  steps: { label: string; state: TraySetupStepState }[];
  /** Words for each state, for screen readers ("done", "in progress", "not started"). */
  stateLabels: Record<TraySetupStepState, string>;
  action?: { label: string; onSelect: () => void; disabled?: boolean };
  width?: number;
}

/** The tray's first-launch window (TrayStates "First launch", US-INST-01): a checklist with progress. */
export function TraySetup({ title, subtitle, steps, stateLabels, action, width = TRAY_WIDTH }: TraySetupProps) {
  const done = steps.filter((s) => s.state === 'done').length;
  const working = steps.some((s) => s.state === 'working') ? 0.5 : 0;
  const value = steps.length ? ((done + working) / steps.length) * 100 : 0;
  return (
    <section className="hl-menu hl-glass hl-glass-3 hl-tray-setup" style={{ width }} aria-label={title}>
      <div className="hl-tray-head">
        <span className="hl-tray-logo">
          <LogoMark size={TRAY_LOGO} title="" simplified={false} />
        </span>
        <span className="hl-tray-id">
          <b>{title}</b>
          <span className="hl-tray-subtitle">{subtitle}</span>
        </span>
      </div>
      <ul className="hl-tray-steps">
        {steps.map((step) => (
          <li key={step.label} className={`hl-tray-step hl-tray-step-${step.state}`}>
            {step.state === 'done' ? (
              <Check aria-hidden {...iconDefaults} />
            ) : step.state === 'working' ? (
              <LoaderCircle aria-hidden className="hl-spin" {...iconDefaults} />
            ) : (
              <Circle aria-hidden {...iconDefaults} />
            )}
            <span>
              {step.label}
              <span className="hl-sr"> ({stateLabels[step.state]})</span>
            </span>
          </li>
        ))}
      </ul>
      <Progress value={value} aria-label={title} className="hl-tray-progress" />
      {action ? (
        <Button size="sm" className="hl-tray-action" onClick={action.onSelect} disabled={action.disabled}>
          {action.label}
        </Button>
      ) : null}
    </section>
  );
}
