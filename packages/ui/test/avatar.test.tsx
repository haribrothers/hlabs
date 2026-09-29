import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Avatar, avatarColorFor } from '../src/index';

describe('Avatar', () => {
  it('shows the initial on the colour, hidden from screen readers', () => {
    const { container } = render(<Avatar name="hari prasad" color="mint" />);
    const el = container.firstElementChild!;
    expect(el).toHaveTextContent('H');
    expect(el).toHaveAttribute('data-accent', 'mint');
    expect(el).toHaveAttribute('aria-hidden', 'true');
  });

  it('uses the stored colour, or a steady one from the username', () => {
    expect(avatarColorFor('hari', 'rose')).toBe('rose');
    expect(avatarColorFor('hari', 'not-a-colour')).toBe(avatarColorFor('hari'));
    expect(avatarColorFor('hari')).toBe(avatarColorFor('hari'));
    expect(['violet', 'mint', 'amber', 'rose']).toContain(avatarColorFor('anu'));
  });
});
