import { createFileRoute } from '@tanstack/react-router';
import { areaLabels } from '../copy/shell';
import { AreaWindow } from '../shell/area-window';

export const Route = createFileRoute('/backups')({
  component: () => <AreaWindow title={areaLabels.backups} />,
});
