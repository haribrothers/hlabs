// cn keeps a type-scale size beside a colour (tailwind-merge took `text-caption` for a colour and dropped it).
import { describe, expect, it } from 'vitest';
import { cn } from './cn';

describe('cn', () => {
  it('keeps a size and a colour together', () => {
    expect(cn('text-caption font-semibold', 'text-success')).toBe('text-caption font-semibold text-success');
    expect(cn('text-label text-ink-muted')).toBe('text-label text-ink-muted');
  });

  it('a later size still replaces an earlier one, and a later colour an earlier one', () => {
    expect(cn('text-caption', 'text-body')).toBe('text-body');
    expect(cn('text-ink', 'text-danger')).toBe('text-danger');
  });
});
