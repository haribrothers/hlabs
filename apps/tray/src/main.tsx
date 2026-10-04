import { getCurrentWindow } from '@tauri-apps/api/window';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './app.css';
import { FitWindow } from './fit-window';
import { Menu } from './menu';
import { quitTray } from './quit';
import { ResetPasswordWindow } from './reset-password';

// No page context menu (Reload, Inspect…) in the menu; development keeps it for the inspector.
if (import.meta.env.PROD) document.addEventListener('contextmenu', (e) => e.preventDefault());

/** The "Reset a password" window (US-INST-17) loads the same page with ?view=reset. */
const resetWindow = new URLSearchParams(location.search).get('view') === 'reset';

// Esc closes the menu, as a native menu does (US-INST-05), or the reset window; ⌘Q quits the menu-bar app (US-INST-10).
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') void (resetWindow ? getCurrentWindow().close() : getCurrentWindow().hide());
  if (e.metaKey && e.key.toLowerCase() === 'q') {
    e.preventDefault();
    void quitTray();
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FitWindow>{resetWindow ? <ResetPasswordWindow /> : <Menu />}</FitWindow>
  </StrictMode>,
);
