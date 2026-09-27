import { useState, type ReactNode } from 'react';

export interface SwitchProps {
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (next: boolean) => void;
  /** Visible label; without it pass aria-label. */
  label?: ReactNode;
  'aria-label'?: string;
  disabled?: boolean;
  id?: string;
}

/** An on/off toggle that applies at once. */
export function Switch({ checked, defaultChecked = false, onChange, label, disabled, id, ...aria }: SwitchProps) {
  const [inner, setInner] = useState(defaultChecked);
  const on = checked ?? inner;
  const toggle = () => {
    if (checked === undefined) setInner(!on);
    onChange?.(!on);
  };
  const control = (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label ? undefined : aria['aria-label']}
      disabled={disabled}
      className="hl-switch"
      onClick={toggle}
    >
      <span className="hl-switch-knob" />
    </button>
  );
  return label ? (
    <label className="hl-switch-label">
      {control}
      {label}
    </label>
  ) : (
    control
  );
}
