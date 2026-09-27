import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FileItem } from '../src/files';

describe('FileItem', () => {
  it('selects on click, opens on double-click and Enter', async () => {
    const onClick = vi.fn();
    const onOpen = vi.fn();
    render(<FileItem name="Taxes 2025.pdf" meta="1.2 MB" selected onClick={onClick} onOpen={onOpen} />);
    const item = screen.getByRole('button', { name: /Taxes 2025\.pdf/ });
    expect(item).toHaveClass('hl-file-selected');
    await userEvent.click(item);
    await userEvent.dblClick(item);
    item.focus();
    await userEvent.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalled();
    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it('shows the icon until a thumbnail loads', () => {
    const { container } = render(<FileItem name="beach.jpg" thumbnail="/thumb.jpg" />);
    const imgs = container.querySelectorAll('img');
    expect(imgs).toHaveLength(2);
    fireEvent.load(imgs[1]!);
    expect(container.querySelectorAll('img')).toHaveLength(1);
  });

  it('falls back to the icon when the thumbnail fails', () => {
    const { container } = render(<FileItem name="beach.jpg" thumbnail="/broken.jpg" view="list" />);
    fireEvent.error(container.querySelectorAll('img')[1]!);
    expect(container.querySelector('.hl-file-thumb')).toBeNull();
    expect(container.querySelectorAll('img')).toHaveLength(1);
  });

  it('labels shared items', () => {
    render(<FileItem name="Family" kind="folder" path="/shared" shared />);
    expect(screen.getByRole('img', { name: 'Shared' })).toBeInTheDocument();
  });
});
