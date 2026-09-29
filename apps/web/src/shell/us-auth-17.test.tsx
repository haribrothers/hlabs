// US-AUTH-17 · Protect every app with forward auth: the 404 page an unknown app hostname gets.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppPage, readAppPageData } from './app-pages';

describe('US-AUTH-17 · 404 page for an unknown app hostname', () => {
  it('says the page doesn’t exist and links Home on the dashboard', () => {
    render(<AppPage data={{ kind: 'notFound', homeUrl: 'https://hlabs.local/' }} />);
    expect(screen.getByRole('heading', { level: 1, name: 'This page doesn’t exist' })).toBeInTheDocument();
    expect(
      screen.getByText('If you followed a link to an app, it may have been uninstalled or renamed.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to Home' })).toHaveAttribute('href', 'https://hlabs.local/');
    expect(document.title).toBe('Page not found · hlabs');
  });

  it('reads its data from the JSON the daemon adds, and goes Home on this host without it', () => {
    document.body.innerHTML =
      '<script id="hlabs-page" type="application/json">{"kind":"notFound","homeUrl":"https://hlabs.local:8443/"}</script>';
    expect(readAppPageData()).toEqual({ kind: 'notFound', homeUrl: 'https://hlabs.local:8443/' });
    document.body.innerHTML = '';
    expect(readAppPageData()).toBeNull();
    render(<AppPage data={null} />);
    expect(screen.getByRole('link', { name: 'Go to Home' })).toHaveAttribute('href', '/');
  });
});
