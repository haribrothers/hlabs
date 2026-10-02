import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './app.css';
import { Menu } from './menu';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Menu />
  </StrictMode>,
);
