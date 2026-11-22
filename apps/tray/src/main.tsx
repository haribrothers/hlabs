import { getCurrentWindow } from '@tauri-apps/api/window';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './app.css';
import { FitWindow } from './fit-window';
import { Menu } from './menu';
import { quitTray } from './quit';
import { ResetPasswordWindow } from './reset-password';
import { UninstallWindow } from './uninstall';

// No page context menu (Reload, Inspect…) in the menu; development keeps it for the inspector.
if (import.meta.env.PROD) document.addEventListener('contextmenu', (e) => e.preventDefault());

/** The "Reset a password" (US-INST-17) and "Uninstall hlabs" (US-INST-21) windows load the same page with ?view=. */
const view = new URLSearchParams(location.search).get('view');
const resetWindow = view === 'reset';

// Esc closes the menu, as a native menu does (US-INST-05), or the reset window; ⌘Q quits the menu-bar app (US-INST-10).
document.addEventListener('keydown', (e) => {
  // The uninstall window handles Esc itself: never while it works.
  if (e.key === 'Escape' && view !== 'uninstall')
    void (resetWindow ? getCurrentWindow().close() : getCurrentWindow().hide());
  if (e.metaKey && e.key.toLowerCase() === 'q') {
    e.preventDefault();
    void quitTray();
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FitWindow>
      {resetWindow ? <ResetPasswordWindow /> : view === 'uninstall' ? <UninstallWindow /> : <Menu />}
    </FitWindow>
  </StrictMode>,
);
