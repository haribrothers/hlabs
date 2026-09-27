import { createFileRoute } from '@tanstack/react-router';
import { areaLabels } from '../copy/shell';
import { AreaWindow } from '../shell/area-window';

export const Route = createFileRoute('/files')({
  component: () => <AreaWindow title={areaLabels.files} />,
});
