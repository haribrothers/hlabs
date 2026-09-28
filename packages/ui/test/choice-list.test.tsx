import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { ChoiceList } from '../src/index';

const options = [
  { value: 'local', title: 'This computer', subtitle: '~/hlabs · 142 GB free' },
  { value: 'external', title: 'External drive' },
  { value: 'nas', title: 'Network storage (NAS)' },
];

function Harness() {
  const [value, setValue] = useState('local');
  return <ChoiceList label="Storage location" options={options} value={value} onChange={setValue} />;
}

describe('ChoiceList', () => {
  it('is a named radio group with the chosen option checked and alone in the tab order', () => {
    render(<Harness />);
    expect(screen.getByRole('radiogroup', { name: 'Storage location' })).toBeInTheDocument();
    const local = screen.getByRole('radio', { name: /This computer/ });
    expect(local).toHaveAttribute('aria-checked', 'true');
    expect(local).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('radio', { name: /External drive/ })).toHaveAttribute('tabindex', '-1');
  });

  it('with nothing chosen, the first option takes the Tab stop', () => {
    render(<ChoiceList label="Drives" options={options} value="" onChange={() => {}} />);
    expect(screen.getByRole('radio', { name: /This computer/ })).toHaveAttribute('tabindex', '0');
    expect(screen.getAllByRole('radio').every((r) => r.getAttribute('aria-checked') === 'false')).toBe(true);
  });

  it('arrow keys move and select; click selects', () => {
    render(<Harness />);
    const local = screen.getByRole('radio', { name: /This computer/ });
    local.focus();
    fireEvent.keyDown(local, { key: 'ArrowDown' });
    const external = screen.getByRole('radio', { name: /External drive/ });
    expect(external).toHaveAttribute('aria-checked', 'true');
    expect(external).toHaveFocus();
    fireEvent.keyDown(external, { key: 'ArrowUp' });
    expect(local).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('radio', { name: /NAS/ }));
    expect(screen.getByRole('radio', { name: /NAS/ })).toHaveAttribute('aria-checked', 'true');
  });
});
