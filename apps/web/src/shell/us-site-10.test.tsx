// US-SITE-10 · Open the right help page from the dashboard: an error toast with a code has "Learn more", which opens
// that error's page on the website in a new tab (`pnpm site:check` makes sure every code has one).
import { act, screen, within } from '@testing-library/react';
import { TRPCClientError } from '@trpc/client';
import { afterEach, describe, expect, it } from 'vitest';
import { learnMoreAction, mutationErrorNotice, showErrorToast } from '../lib/error-copy';
import { currentToasts, dismissToast } from '../lib/toasts';
import { renderWithDaemon } from '../test/render';
import { Toaster } from './toaster';

afterEach(() => {
  for (const t of currentToasts()) dismissToast(t.id);
});

const failure = (hlabsCode?: string) => {
  const err = new TRPCClientError('raw message');
  Object.assign(err, { data: hlabsCode ? { hlabsCode, detail: {} } : {} });
  return err;
};

describe('US-SITE-10', () => {
  it('an error toast says "Learn more", opening its page on the website in a new tab', () => {
    renderWithDaemon(<Toaster />);
    act(() => void showErrorToast(failure('APP_PORT_IN_USE')));
    const toast = screen.getByRole('alert');
    const link = within(toast).getByRole('link', { name: /^Learn more/ });
    expect(link).toHaveAttribute('href', 'https://hlabs.h4loom.com/help/errors/app-port-in-use/');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveAccessibleName(/^Learn more ?\(opens in a new tab\)$/);
  });

  it('the "wait for … to finish" warning has it too', () => {
    renderWithDaemon(<Toaster />);
    act(() => mutationErrorNotice(failure('JOB_EXCLUSIVE_RUNNING'), undefined));
    expect(within(screen.getByRole('status')).getByRole('link', { name: /^Learn more/ })).toHaveAttribute(
      'href',
      'https://hlabs.h4loom.com/help/errors/job-exclusive-running/',
    );
  });

  it("no code, or one hlabs has no words for, means no link (there'd be no page)", () => {
    expect(learnMoreAction(null)).toEqual([]);
    expect(learnMoreAction('SOMETHING_NEW')).toEqual([]);
    renderWithDaemon(<Toaster />);
    act(() => void showErrorToast(failure()));
    expect(within(screen.getByRole('alert')).queryByRole('link')).toBeNull();
  });
});
