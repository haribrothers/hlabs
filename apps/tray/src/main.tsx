import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './app.css';
import { FitWindow } from './fit-window';
import { Menu } from './menu';

// No page context menu (Reload, Inspect…) in the menu; development keeps it for the inspector.
if (import.meta.env.PROD) document.addEventListener('contextmenu', (e) => e.preventDefault());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FitWindow>
      <Menu />
    </FitWindow>
  </StrictMode>,
);
