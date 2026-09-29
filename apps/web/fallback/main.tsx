// The page Caddy serves when the daemon doesn't answer (US-STATE-04): "Can't reach hlabs" with nothing from the daemon
// (no /trpc). It asks /healthz and, once hlabs answers, loads the address that was asked for.
import { UiStringsProvider } from '@hlabs/ui';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { uiStrings } from '../src/copy/shell';
import { checkHealth, DaemonDownController } from '../src/health/daemon-down';
import { DaemonDownView } from '../src/health/daemon-down-view';
import './fallback.css';

const controller = new DaemonDownController({ check: () => checkHealth('/healthz'), onBack: () => location.reload() });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <UiStringsProvider strings={uiStrings}>
      <DaemonDownView controller={controller} />
    </UiStringsProvider>
  </StrictMode>,
);
