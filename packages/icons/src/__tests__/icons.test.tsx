import { render, screen, fireEvent } from '@testing-library/react';
import { AppLogo, gradientFor, LogoLockup, LogoMark, TabHome, tabGlyphs, Download } from '../index';
import { AppIconManifest, resolveAppIcon } from '../manifest';

describe('tab glyphs', () => {
  it('are filled, 24px and hidden from screen readers by default', () => {
    const { container } = render(<TabHome />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('fill')).toBe('currentColor');
    expect(svg.getAttribute('width')).toBe('24');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
  });
  it('get an accessible name when titled', () => {
    render(<TabHome title="Home" />);
    expect(screen.getByRole('img', { name: 'Home' })).toBeTruthy();
  });
  it('cover the six areas and search', () => {
    expect(Object.keys(tabGlyphs)).toEqual(['home', 'store', 'files', 'usage', 'backups', 'settings', 'search']);
  });
});

describe('lucide re-export', () => {
  it('renders a Lucide icon from the package', () => {
    const { container } = render(<Download />);
    expect(container.querySelector('svg')?.getAttribute('stroke')).toBe('currentColor');
  });
});

describe('logo', () => {
  it('keeps the 201:163 aspect ratio', () => {
    const { container } = render(<LogoMark size={163} />);
    expect(container.querySelector('svg')!.getAttribute('width')).toBe('201');
  });
  it('gives each instance its own gradient id', () => {
    const { container } = render(
      <>
        <LogoMark />
        <LogoMark />
      </>,
    );
    const ids = [...container.querySelectorAll('linearGradient')].map((g) => g.id);
    expect(new Set(ids).size).toBe(2);
  });
  it('mono tones have no gradient', () => {
    const { container } = render(<LogoLockup tone="white" />);
    expect(container.querySelector('linearGradient')).toBeNull();
  });
  it('drops the dots at 20px and below', () => {
    const { container: small } = render(<LogoMark size={18} tone="white" />);
    expect(small.querySelectorAll('circle').length).toBe(0);
    const { container: big } = render(<LogoMark size={48} tone="white" />);
    expect(big.querySelectorAll('circle').length).toBe(3);
  });
  it('is decorative when title is empty', () => {
    const { container } = render(<LogoMark title="" />);
    expect(container.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('AppLogo', () => {
  it('shows the manifest logo', () => {
    render(<AppLogo name="Jellyfin" src="/api/apps/jellyfin/assets/logo.svg" />);
    expect(screen.getByRole('img', { name: 'Jellyfin' }).tagName).toBe('IMG');
  });
  it('falls back to the gradient tile when the logo fails', () => {
    const { container } = render(<AppLogo name="Jellyfin" src="/broken.png" />);
    fireEvent.error(container.querySelector('img')!);
    expect(container.firstElementChild!.getAttribute('data-state')).toBe('fallback');
  });
  it('picks the same fallback gradient for the same name', () => {
    expect(gradientFor('Immich')).toEqual(gradientFor('Immich'));
  });
});

describe('manifest', () => {
  it('accepts a full icon block', () => {
    const icon = AppIconManifest.parse({ logo: 'logo.svg', gradient: ['#8b5cf6', '#4c1d95'], fallback: 'film' });
    expect(resolveAppIcon(icon, '/api/apps/jellyfin/assets/').logoUrl).toBe('/api/apps/jellyfin/assets/logo.svg');
  });
  it('rejects bad colours and unknown keys', () => {
    expect(AppIconManifest.safeParse({ gradient: ['purple', '#000000'] }).success).toBe(false);
    expect(AppIconManifest.safeParse({ logo: 'a.png', colour: '#fff' }).success).toBe(false);
  });
  it('keeps https logos as they are', () => {
    expect(resolveAppIcon({ logo: 'https://cdn.example.org/x.png' }, '/a/').logoUrl).toBe(
      'https://cdn.example.org/x.png',
    );
  });
});

import { FileIcon, fileKindOf, folderKindOf, fileIconUrl, FOLDER_COLOUR } from '../file-icons';
import { FILE_ICON_SVGS } from '../file-icons/data';

describe('file icons', () => {
  it('maps extensions case-insensitively', () => {
    expect(fileKindOf('Lease agreement.PDF')).toBe('pdf');
    expect(fileKindOf('holiday.HEIC')).toBe('image');
    expect(fileKindOf('backup.tar.gz')).toBe('archive');
    expect(fileKindOf('Makefile')).toBe('unknown');
  });
  it('falls back to the MIME type', () => {
    expect(fileKindOf('scan', 'image/png')).toBe('image');
    expect(fileKindOf('noext', 'application/pdf')).toBe('pdf');
  });
  it('gives special icons only to well-known top-level folders', () => {
    expect(folderKindOf('/home/Photos')).toBe('pictures');
    expect(folderKindOf('/home/Photos/2024')).toBe('plain');
    expect(folderKindOf('/users/hari/Downloads')).toBe('downloads');
    expect(folderKindOf('/shared')).toBe('shared');
    expect(folderKindOf('/appdata/immich')).toBe('apps');
    expect(folderKindOf('/drives/nas')).toBe('network');
  });
  it('has art for every colour, folder kind and size', () => {
    for (const c of Object.values(FOLDER_COLOUR))
      for (const k of [
        'plain',
        'documents',
        'pictures',
        'music',
        'videos',
        'downloads',
        'shared',
        'apps',
        'backup',
        'network',
        'private',
      ])
        for (const s of ['24', '64']) expect(FILE_ICON_SVGS[`${s}/folder-${c}-${k}`]).toContain('<svg');
  });
  it('folders follow the accent', () => {
    expect(decodeURIComponent(fileIconUrl({ folder: 'plain', accent: 'mint' }))).toBe(
      'data:image/svg+xml;utf8,' + FILE_ICON_SVGS['64/folder-teal-plain'],
    );
  });
  it('uses 24px art at small sizes and is decorative', () => {
    const { container } = render(<FileIcon name="a.pdf" size={24} />);
    const img = container.querySelector('img')!;
    expect(decodeURIComponent(img.getAttribute('src')!)).toContain(FILE_ICON_SVGS['24/file-pdf']!.slice(0, 40));
    expect(img.getAttribute('alt')).toBe('');
  });
});
