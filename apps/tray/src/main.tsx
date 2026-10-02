import { getCurrentWindow } from '@tauri-apps/api/window';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './app.css';
import { FitWindow } from './fit-window';
import { Menu } from './menu';
import { quitTray } from './quit';

// No page context menu (Reload, Inspect…) in the menu; development keeps it for the inspector.
if (import.meta.env.PROD) document.addEventListener('contextmenu', (e) => e.preventDefault());

// Esc closes the menu, as a native menu does (US-INST-05); ⌘Q quits the menu-bar app (US-INST-10).
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') void getCurrentWindow().hide();
  if (e.metaKey && e.key.toLowerCase() === 'q') {
    e.preventDefault();
    void quitTray();
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FitWindow>
      <Menu />
    </FitWindow>
  </StrictMode>,
);
