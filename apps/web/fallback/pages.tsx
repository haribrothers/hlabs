// The daemon's pages for app hostnames (US-AUTH-17, US-AUTH-19), built into dist-fallback/pages.html with everything
// inlined. The daemon adds the page's data as JSON (`<script id="hlabs-page">`).
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppPage, readAppPageData } from '../src/shell/app-pages';
import './fallback.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppPage data={readAppPageData()} />
  </StrictMode>,
);
