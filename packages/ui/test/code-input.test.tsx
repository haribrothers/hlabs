import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { CodeInput } from '../src/index';

function Harness({ onComplete }: { onComplete?: (code: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <>
      <CodeInput label="6-digit code" value={value} onChange={setValue} onComplete={onComplete} />
      <output data-testid="value">{value}</output>
    </>
  );
}

const digit = (n: number) => screen.getByLabelText(`Digit ${n}`);

describe('CodeInput', () => {
  it('has six digit fields in a named group, the first offering one-time-code autofill', () => {
    render(<Harness />);
    expect(screen.getByRole('group', { name: '6-digit code' })).toBeInTheDocument();
    for (let n = 1; n <= 6; n++) expect(digit(n)).toHaveAttribute('inputmode', 'numeric');
    expect(digit(1)).toHaveAttribute('autocomplete', 'one-time-code');
  });

  it('accepts digits only and moves to the next field', () => {
    render(<Harness />);
    fireEvent.change(digit(1), { target: { value: 'a' } });
    expect(screen.getByTestId('value')).toHaveTextContent('');
    fireEvent.change(digit(1), { target: { value: '4' } });
    expect(digit(2)).toHaveFocus();
    fireEvent.change(digit(2), { target: { value: '8' } });
    expect(screen.getByTestId('value')).toHaveTextContent('48');
  });

  it('Backspace clears and goes back', () => {
    render(<Harness />);
    fireEvent.change(digit(1), { target: { value: '4' } });
    fireEvent.change(digit(2), { target: { value: '8' } });
    fireEvent.keyDown(digit(3), { key: 'Backspace' });
    expect(screen.getByTestId('value')).toHaveTextContent(/^4$/);
    expect(digit(2)).toHaveFocus();
  });

  it('pasting fills every field and completes', () => {
    const onComplete = vi.fn();
    render(<Harness onComplete={onComplete} />);
    fireEvent.paste(digit(1), { clipboardData: { getData: () => '123 456' } });
    expect(screen.getByTestId('value')).toHaveTextContent('123456');
    expect(onComplete).toHaveBeenCalledWith('123456');
  });

  it('completes when the sixth digit is typed', () => {
    const onComplete = vi.fn();
    render(<Harness onComplete={onComplete} />);
    '48125'.split('').forEach((d, i) => fireEvent.change(digit(i + 1), { target: { value: d } }));
    expect(onComplete).not.toHaveBeenCalled();
    fireEvent.change(digit(6), { target: { value: '9' } });
    expect(onComplete).toHaveBeenCalledWith('481259');
  });
});
