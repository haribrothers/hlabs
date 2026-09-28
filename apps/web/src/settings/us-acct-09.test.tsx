import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { twoFactorOn } from '../test/account';
import { renderScreen } from '../test/render';
import { recoveryFileName, TwoFactorManage, type AccountData } from './two-factor-manage';

const account = (used = 0) => twoFactorOn(used)() as unknown as AccountData;
const CODES = Array.from({ length: 10 }, (_, i) => `abc${i}-def${i}`);

afterEach(() => vi.restoreAllMocks());

describe('US-ACCT-09', () => {
  it('normally the 10 slots are masked, used ones struck through with "Used"; Download and Print wait', async () => {
    renderScreen(() => <TwoFactorManage account={account(2)} onClose={() => {}} />, {});
    const list = await screen.findByRole('list', { name: 'Recovery codes' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(10);
    expect(items[0]).toHaveTextContent('••••-••••Used');
    expect(items[0]).toHaveClass('line-through');
    expect(items[5]).toHaveTextContent('••••-••••');
    expect(items[5]).not.toHaveClass('line-through');
    expect(
      screen.getByText(
        'Each code works once if you lose your phone. Keep them somewhere safe, like a password manager.',
      ),
    ).toBeInTheDocument();
    for (const name of ['Download', 'Print']) {
      const button = screen.getByRole('button', { name });
      expect(button).toBeDisabled();
      expect(button.parentElement).toHaveAttribute('title', 'Make new codes to see them again');
    }
  });

  it('right after they are made, the codes show in plain text and can be downloaded and printed', async () => {
    renderScreen(() => <TwoFactorManage account={account()} codes={CODES} onClose={() => {}} />, {});
    const list = await screen.findByRole('list', { name: 'Recovery codes' });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(CODES);
    expect(list).toHaveClass('font-mono');

    const created: Blob[] = [];
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      created.push(blob as Blob);
      return 'blob:codes';
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    let fileName = '';
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      fileName = this.download;
    });
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    expect(fileName).toBe('hlabs-recovery-codes-hari.txt');
    expect(fileName).toBe(recoveryFileName('hari'));
    const text = await created[0]!.text();
    expect(text).toContain('Server: hlabs');
    expect(text).toContain('Username: hari');
    expect(text.split('\n')).toEqual(expect.arrayContaining(CODES));

    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    fireEvent.click(screen.getByRole('button', { name: 'Print' }));
    expect(print).toHaveBeenCalled();
    expect(list.closest('.hl-print-area')).not.toBeNull();
  });
});
