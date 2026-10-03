// "Reset a password" (US-INST-17, TrayResetPassword): a small window from the menu. Pick an account (admins first) and
// a new password (at least 12 characters, not a common one, checked as you type); if the account has two-factor, it
// can be turned off too. "Reset password" is enabled once the password is allowed; macOS confirms first (US-INST-18).
import type { TrayUser } from '@hlabs/api';
import { Eye, EyeOff, iconDefaults, LogoMark } from '@hlabs/icons';
import { passwordIssue } from '@hlabs/shared';
import { Button, TextField } from '@hlabs/ui';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useEffect, useId, useState, type FormEvent } from 'react';
import { trayCopy } from './copy';
import { daemon } from './daemon';

const c = trayCopy.reset;
const LOGO = 28;

export interface ResetPasswordProps {
  /** Runs the OS check and the reset (US-INST-18); resolves when the window may close. */
  onSubmit?: (input: { username: string; newPassword: string; disableTotp: boolean }) => Promise<void>;
  onCancel?: () => void;
}

export function ResetPassword({ onSubmit, onCancel }: ResetPasswordProps) {
  const [users, setUsers] = useState<TrayUser[] | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [shown, setShown] = useState(false);
  const [disableTotp, setDisableTotp] = useState(false);
  const [busy, setBusy] = useState(false);
  const accountId = useId();

  useEffect(() => {
    void daemon
      .query('listUsers')
      .then(({ users: list }) => {
        setUsers(list);
        setUsername((current) => current || (list[0]?.username ?? ''));
      })
      .catch(() => setUsers([]));
  }, []);

  const selected = users?.find((u) => u.username === username);
  const issue = password === '' ? null : passwordIssue(password);
  const valid = selected !== undefined && password !== '' && issue === null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid || !onSubmit) return;
    setBusy(true);
    try {
      await onSubmit({ username, newPassword: password, disableTotp: selected.totpEnabled && disableTotp });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="hl-glass hl-glass-3 tray-dialog" aria-labelledby="reset-title" onSubmit={(e) => void submit(e)}>
      <div className="tray-dialog-head">
        <span className="tray-dialog-logo" aria-hidden>
          <LogoMark size={LOGO} title="" simplified={false} />
        </span>
        <span>
          <h1 id="reset-title" className="tray-dialog-title">
            {c.title}
          </h1>
          <p className="tray-dialog-note">{c.note}</p>
        </span>
      </div>

      <div className="hl-field">
        <label className="hl-field-label" htmlFor={accountId}>
          {c.account}
        </label>
        <select
          id={accountId}
          className="hl-input"
          value={username}
          disabled={users === null}
          onChange={(e) => {
            setUsername(e.target.value);
            setDisableTotp(false);
          }}
        >
          {users === null ? <option>{c.loading}</option> : null}
          {users?.map((u) => (
            <option key={u.id} value={u.username}>
              {c.accountOption(u.displayName, u.username, u.role === 'admin')}
            </option>
          ))}
        </select>
      </div>

      <TextField
        label={c.newPassword}
        type={shown ? 'text' : 'password'}
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={issue === 'tooShort' ? c.tooShort : issue === 'tooCommon' ? c.tooCommon : undefined}
        announce="polite"
        trailing={
          <button
            type="button"
            className="tray-reveal"
            aria-label={shown ? c.hidePassword : c.showPassword}
            aria-pressed={shown}
            onClick={() => setShown((v) => !v)}
          >
            {shown ? <EyeOff aria-hidden {...iconDefaults} /> : <Eye aria-hidden {...iconDefaults} />}
          </button>
        }
      />

      {selected?.totpEnabled ? (
        <label className="tray-check">
          <input type="checkbox" checked={disableTotp} onChange={(e) => setDisableTotp(e.target.checked)} />
          {c.turnOffTwoFactor}
        </label>
      ) : null}

      <p className="tray-dialog-note">{c.osConfirm}</p>

      <div className="tray-dialog-actions">
        <Button variant="secondary" size="sm" onClick={onCancel}>
          {c.cancel}
        </Button>
        <Button type="submit" size="sm" disabled={!valid} busy={busy}>
          {c.submit}
        </Button>
      </div>
    </form>
  );
}

/** The window itself: Cancel or Esc closes it. */
export function ResetPasswordWindow() {
  const close = () => void getCurrentWindow().close();
  return <ResetPassword onCancel={close} />;
}
