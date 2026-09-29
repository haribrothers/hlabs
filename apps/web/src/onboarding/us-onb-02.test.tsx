import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WelcomeStep } from './welcome-step';

describe('US-ONB-02', () => {
  it('shows the welcome copy with Get started focused and the heading as the h1', () => {
    render(<WelcomeStep onStart={() => {}} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Welcome to hlabs');
    expect(screen.getByText('Your own cloud, running on this computer.')).toBeInTheDocument();
    expect(screen.getByText('Setup takes about five minutes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Get started' })).toHaveFocus();
  });

  it('starts setup from Get started', () => {
    const onStart = vi.fn();
    render(<WelcomeStep onStart={onStart} />);
    fireEvent.click(screen.getByRole('button', { name: 'Get started' }));
    expect(onStart).toHaveBeenCalledOnce();
  });

  it('shows no Stepper and no restore link before phase 8', () => {
    render(<WelcomeStep onStart={() => {}} />);
    expect(screen.queryByText(/^Step \d/)).toBeNull();
    expect(screen.queryByText('Restore from a backup instead')).toBeNull();
  });

  it('waits while saving and says what to do if it fails', () => {
    const { rerender } = render(<WelcomeStep onStart={() => {}} pending />);
    expect(screen.getByRole('button', { name: 'Get started' })).toBeDisabled();
    rerender(<WelcomeStep onStart={() => {}} failed />);
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't start setup. Try again.");
  });
});
