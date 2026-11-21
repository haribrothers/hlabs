// "Uninstall hlabs" (US-INST-21, US-INST-22, TrayUninstall, D-143): choose whether the data stays (and whether
// hlabs's Colima goes), then macOS confirms it's you, and the window lists the steps as they happen (TraySetup): the
// daemon's job stops the apps (and removes Colima), then the Rust side removes hlabs, deletes the data when asked and
// puts hlabs in the Trash. A step that fails says what to do, with Try again (from that step) and Copy diagnostics.
import type { Job } from '@hlabs/api';
import { LogoMark } from '@hlabs/icons';
import { Button, TraySetup, type TraySetupStepState } from '@hlabs/ui';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { trayCopy } from './copy';
import { daemon, DaemonCallError } from './daemon';
import { formatFree } from './format';

const c = trayCopy.uninstallWindow;
const LOGO = 28;
export const JOB_POLL_MS = 1_000;

export interface UninstallInfo {
  appCount: number;
  dataBytes: number | null;
  storageRoot: string;
  colimaManaged: boolean;
}

/** What the window asks of the rest of hlabs; the window itself uses the daemon and the Rust side. */
export interface UninstallActions {
  info(): Promise<UninstallInfo>;
  /** macOS confirms it's you; false when cancelled. */
  confirm(): Promise<boolean>;
  start(input: { keepData: boolean; removeColima: boolean }): Promise<string>;
  job(jobId: string): Promise<Job>;
  removeHlabs(): Promise<void>;
  deleteData(storageRoot: string): Promise<void>;
  quit(): Promise<void>;
  copyDiagnostics(): Promise<void>;
  close(): void;
}

type Step = 'stoppingApps' | 'removingColima' | 'removingHlabs' | 'deletingData';

/** "/Users/hari/hlabs" → "~/hlabs". */
export const tilde = (path: string) => path.replace(/^\/(Users|home)\/[^/]+(?=\/|$)/, '~');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function Uninstall({ actions, pollMs = JOB_POLL_MS }: { actions: UninstallActions; pollMs?: number }) {
  const [info, setInfo] = useState<UninstallInfo | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [keepData, setKeepData] = useState(true);
  const [removeColima, setRemoveColima] = useState(false);
  const [busy, setBusy] = useState(false);
  const [states, setStates] = useState<Partial<Record<Step, TraySetupStepState>> | null>(null);
  const [failedAt, setFailedAt] = useState<Step | null>(null);
  const [copied, setCopied] = useState(false);
  const running = useRef(false);
  const groupId = useId();

  useEffect(() => {
    actions
      .info()
      .then(setInfo)
      .catch(() => setProblem(c.unreachable));
  }, [actions]);

  const steps: Step[] = [
    'stoppingApps',
    ...(removeColima ? (['removingColima'] as const) : []),
    'removingHlabs',
    ...(keepData ? [] : (['deletingData'] as const)),
  ];
  const mark = (step: Step, state: TraySetupStepState) => setStates((s) => ({ ...s, [step]: state }));

  const runFrom = async (from: Step) => {
    if (running.current || !info) return;
    running.current = true;
    setProblem(null);
    setFailedAt(null);
    const order = steps.slice(steps.indexOf(from));
    let current: Step = from;
    const fail = (message: string) => {
      mark(current, 'failed');
      setFailedAt(current);
      setProblem(message);
    };
    try {
      if (order[0] === 'stoppingApps' || order[0] === 'removingColima') {
        current = 'stoppingApps';
        mark('stoppingApps', 'working');
        let jobId: string;
        try {
          jobId = await actions.start({ keepData, removeColima });
        } catch (err) {
          const code = err instanceof DaemonCallError && err.failure.kind === 'api' ? err.failure.hlabsCode : null;
          return fail(code === 'JOB_EXCLUSIVE_RUNNING' ? c.busy : c.unreachable);
        }
        for (;;) {
          const job = await actions.job(jobId).catch(() => null);
          if (job?.message === 'removingColima' && current !== 'removingColima') {
            mark('stoppingApps', 'done');
            current = 'removingColima';
            mark('removingColima', 'working');
          }
          if (job?.state === 'succeeded') break;
          if (job?.state === 'failed' || job?.state === 'cancelled') {
            return fail(current === 'removingColima' ? c.colimaFailed : c.appsFailed);
          }
          await sleep(pollMs);
        }
        mark(current, 'done');
        if (removeColima) mark('removingColima', 'done');
        mark('stoppingApps', 'done');
      }
      if (order.includes('removingHlabs')) {
        current = 'removingHlabs';
        mark(current, 'working');
        if (
          !(await actions.removeHlabs().then(
            () => true,
            () => false,
          ))
        )
          return fail(c.removeFailed);
        mark(current, 'done');
      }
      if (order.includes('deletingData')) {
        current = 'deletingData';
        mark(current, 'working');
        if (
          !(await actions.deleteData(info.storageRoot).then(
            () => true,
            () => false,
          ))
        )
          return fail(c.deleteFailed);
        mark(current, 'done');
      }
      if (
        !(await actions.quit().then(
          () => true,
          () => false,
        ))
      )
        setProblem(c.quitFailed);
    } finally {
      running.current = false;
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!info || busy) return;
    setBusy(true);
    setProblem(null);
    const confirmed = await actions.confirm().catch(() => false);
    setBusy(false);
    // Cancelled at the macOS prompt: nothing changed and the choices stay.
    if (!confirmed) return;
    setStates(Object.fromEntries(steps.map((s) => [s, 'pending'])));
    void runFrom('stoppingApps');
  };

  // Esc closes the window before anything has started, never during the steps.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && states === null) actions.close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [actions, states]);

  if (states) {
    const root = info ? tilde(info.storageRoot) : '';
    return (
      <TraySetup
        title={c.progressTitle}
        subtitle={keepData ? c.keepingSubtitle(root) : c.deletingSubtitle}
        steps={steps.map((s) => ({ label: c[s], state: states[s] ?? 'pending' }))}
        stateLabels={c.stepStates}
        problem={problem ?? undefined}
        width={440}
        action={failedAt ? { label: c.tryAgain, onSelect: () => void runFrom(failedAt) } : undefined}
        secondaryAction={
          failedAt
            ? {
                label: copied ? c.copied : c.copyDiagnostics,
                onSelect: () => void actions.copyDiagnostics().then(() => setCopied(true)),
              }
            : undefined
        }
      />
    );
  }

  const root = info ? tilde(info.storageRoot) : '';
  return (
    <form
      className="hl-glass hl-glass-3 tray-dialog"
      aria-labelledby="uninstall-title"
      onSubmit={(e) => void submit(e)}
    >
      <div className="tray-dialog-head">
        <span className="tray-dialog-logo" aria-hidden>
          <LogoMark size={LOGO} title="" simplified={false} />
        </span>
        <span>
          <h1 id="uninstall-title" className="tray-dialog-title">
            {c.title}
          </h1>
          <p className="tray-dialog-note">{info ? c.lead(info.appCount) : c.loading}</p>
        </span>
      </div>

      <div role="radiogroup" aria-label={c.whatToKeep} className="tray-choices" id={groupId}>
        <label className={`tray-choice${keepData ? ' tray-choice-on' : ''}`}>
          <input type="radio" name="keep" checked={keepData} onChange={() => setKeepData(true)} disabled={!info} />
          <span>
            <b>{c.keep}</b>
            <span className="tray-dialog-note">{c.keepNote(root)}</span>
          </span>
        </label>
        <label className={`tray-choice${keepData ? '' : ' tray-choice-on'}`}>
          <input type="radio" name="keep" checked={!keepData} onChange={() => setKeepData(false)} disabled={!info} />
          <span>
            <b>{c.deleteAll}</b>
            <span className="tray-dialog-note">
              {c.deleteNote(info?.dataBytes == null ? null : formatFree(info.dataBytes), root)}
            </span>
          </span>
        </label>
      </div>

      {info?.colimaManaged ? (
        <label className="tray-check">
          <input type="checkbox" checked={removeColima} onChange={(e) => setRemoveColima(e.target.checked)} />
          {c.removeColima}
        </label>
      ) : null}

      <p className="tray-dialog-note">{c.note}</p>

      {problem ? (
        <p className="tray-dialog-problem" role="alert">
          {problem}
        </p>
      ) : null}

      <div className="tray-dialog-actions">
        <Button variant="secondary" size="sm" onClick={() => actions.close()}>
          {c.cancel}
        </Button>
        <Button type="submit" size="sm" variant={keepData ? 'primary' : 'destructive'} disabled={!info} busy={busy}>
          {c.submit}
        </Button>
      </div>
    </form>
  );
}

/** The window itself: the daemon for the job, the Rust side for everything else. */
export function UninstallWindow() {
  const [actions] = useState<UninstallActions>(() => ({
    info: () => daemon.query('uninstallInfo'),
    confirm: () => invoke<boolean>('confirm_uninstall'),
    start: async (input) => (await daemon.mutate('uninstall', input)).jobId,
    job: (jobId) => daemon.query('job', { jobId }),
    removeHlabs: () => invoke('uninstall_remove_hlabs'),
    deleteData: (storageRoot) => invoke('uninstall_delete_data', { storageRoot }),
    quit: () => invoke('uninstall_quit'),
    copyDiagnostics: () => invoke('copy_local_diagnostics'),
    close: () => void getCurrentWindow().close(),
  }));
  return <Uninstall actions={actions} />;
}
