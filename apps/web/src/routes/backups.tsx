// The Dock's Backups tile (D-054) opens Backups in Settings, as the BackupsOverview screen draws it.
import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/backups')({
  beforeLoad: () => {
    throw redirect({ to: '/settings/$section', params: { section: 'backups' } });
  },
});
