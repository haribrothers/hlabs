import { getCurrentWindow } from '@tauri-apps/api/window';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './app.css';
import { FitWindow } from './fit-window';
import { Menu } from './menu';

// No page context menu (Reload, Inspect…) in the menu; development keeps it for the inspector.
if (import.meta.env.PROD) document.addEventListener('contextmenu', (e) => e.preventDefault());

// Esc closes the menu, as a native menu does (US-INST-05).
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') void getCurrentWindow().hide();
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FitWindow>
      <Menu />
    </FitWindow>
  </StrictMode>,
);
