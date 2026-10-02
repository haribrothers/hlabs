import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './app.css';
import { FitWindow } from './fit-window';
import { Menu } from './menu';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FitWindow>
      <Menu />
    </FitWindow>
  </StrictMode>,
);
