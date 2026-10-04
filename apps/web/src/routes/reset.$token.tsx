import { createFileRoute } from '@tanstack/react-router';
import { ResetView } from '../login/reset-view';

export const Route = createFileRoute('/reset/$token')({
  component: function Reset() {
    return <ResetView token={Route.useParams().token} />;
  },
});
