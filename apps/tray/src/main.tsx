// Phase 0 skeleton: renders the TrayMenu. Status, stats and actions arrive in phase 4 (US-INST-05…).
import { TrayMenu } from '@hlabs/ui';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './app.css';
import { trayCopy as t } from './copy';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TrayMenu
      statusText={t.running}
      stats={[
        { label: t.cpu, value: '—' },
        { label: t.memory, value: '—' },
        { label: t.free, value: '—' },
      ]}
      items={[
        { label: t.openDashboard },
        { label: t.copyAddress },
        { label: t.backUpNow },
        { separator: true },
        { label: t.quit },
      ]}
    />
  </StrictMode>,
);
