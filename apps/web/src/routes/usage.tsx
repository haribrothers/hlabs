import { isFeatureEnabled } from '@hlabs/shared';
import { createFileRoute } from '@tanstack/react-router';
import { areaLabels } from '../copy/shell';
import { AreaWindow } from '../shell/area-window';
import { UsagePage } from '../usage/usage-page';

export const Route = createFileRoute('/usage')({
  // Live usage ships in phase 4 (D-036); until then the area's placeholder.
  component: () => (isFeatureEnabled('liveUsage') ? <UsagePage /> : <AreaWindow title={areaLabels.usage} />),
});
