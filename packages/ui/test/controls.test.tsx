import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Badge, Button, Progress, Segmented, StatusDot, Switch, TextField } from '../src/index';

describe('Button', () => {
  it('renders a typed button by default and a link with href', () => {
    const { rerender } = render(<Button>Install</Button>);
    const button = screen.getByRole('button', { name: 'Install' });
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toHaveClass('hl-btn', 'hl-btn-primary', 'hl-btn-md');
    rerender(
      <Button href="/store" variant="link">
        Learn more
      </Button>,
    );
    expect(screen.getByRole('link', { name: 'Learn more' })).toHaveClass('hl-btn-link');
    expect(screen.getByRole('link')).not.toHaveClass('hl-btn-md');
  });

  it('is disabled and not clickable when disabled', async () => {
    const onClick = vi.fn();
    render(
      <Button variant="destructive" disabled onClick={onClick}>
        Uninstall
      </Button>,
    );
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('Switch', () => {
  it('toggles uncontrolled with click and keyboard, and reports changes', async () => {
    const onChange = vi.fn();
    render(<Switch label="Start automatically" onChange={onChange} />);
    const sw = screen.getByRole('switch', { name: 'Start automatically' });
    expect(sw).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(sw);
    expect(sw).toHaveAttribute('aria-checked', 'true');
    sw.focus();
    await userEvent.keyboard(' ');
    expect(sw).toHaveAttribute('aria-checked', 'false');
    expect(onChange.mock.calls).toEqual([[true], [false]]);
  });

  it('follows the checked prop when controlled', async () => {
    render(<Switch checked aria-label="Remote access" onChange={() => {}} />);
    const sw = screen.getByRole('switch', { name: 'Remote access' });
    await userEvent.click(sw);
    expect(sw).toHaveAttribute('aria-checked', 'true');
  });
});

describe('TextField', () => {
  it('links its label and hint', () => {
    render(<TextField label="Username" hint="Lowercase letters and numbers" />);
    const input = screen.getByLabelText('Username');
    expect(input).toHaveAccessibleDescription('Lowercase letters and numbers');
    expect(input).not.toHaveAttribute('aria-invalid');
  });

  it('shows the error instead of the hint and marks the field invalid', () => {
    render(<TextField label="Password" hint="12 characters" error="Use at least 12 characters" />);
    const input = screen.getByLabelText('Password');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Use at least 12 characters');
    expect(screen.queryByText('12 characters')).toBeNull();
  });
});

describe('Segmented', () => {
  const options = [
    { value: '1h', label: '1 hour' },
    { value: '24h', label: '24 hours' },
    { value: '7d', label: '7 days' },
  ];

  it('is a radio group with one tab stop, moved with arrow keys, Home and End', async () => {
    function Controlled() {
      const [v, setV] = useState('24h');
      return <Segmented aria-label="Time range" options={options} value={v} onChange={setV} />;
    }
    render(<Controlled />);
    const group = screen.getByRole('radiogroup', { name: 'Time range' });
    expect(group).toBeInTheDocument();
    const radios = screen.getAllByRole('radio');
    expect(radios.map((r) => r.tabIndex)).toEqual([-1, 0, -1]);
    radios[1]!.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: '7 days' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: '7 days' })).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: '1 hour' })).toHaveAttribute('aria-checked', 'true');
    await userEvent.keyboard('{End}');
    expect(screen.getByRole('radio', { name: '7 days' })).toHaveAttribute('aria-checked', 'true');
    await userEvent.keyboard('{Home}');
    expect(screen.getByRole('radio', { name: '1 hour' })).toHaveFocus();
  });
});

describe('Badge, StatusDot, Progress', () => {
  it('pairs every status colour with words', () => {
    render(
      <>
        <Badge tone="success">Installed</Badge>
        <StatusDot status="working">Starting…</StatusDot>
      </>,
    );
    expect(screen.getByText('Installed')).toHaveClass('hl-badge-success');
    expect(screen.getByText('Starting…')).toHaveClass('hl-status-working');
  });

  it('exposes progress with a clamped value and a default percentage', () => {
    render(<Progress value={142.4} label="Downloading Immich" />);
    const bar = screen.getByRole('progressbar', { name: 'Downloading Immich' });
    expect(bar).toHaveAttribute('aria-valuenow', '100');
    expect(screen.getByText('100%')).toBeInTheDocument();
  });
});
