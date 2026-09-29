import { createFileRoute } from '@tanstack/react-router';
import { SectionPage } from '../settings/section-page';

export const Route = createFileRoute('/settings/$section')({
  component: function SettingsSection() {
    return <SectionPage id={Route.useParams().section} />;
  },
});
