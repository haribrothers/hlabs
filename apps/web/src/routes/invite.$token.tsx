import { createFileRoute } from '@tanstack/react-router';
import { AcceptInvite } from '../login/accept-invite';

export const Route = createFileRoute('/invite/$token')({
  component: function Invite() {
    return <AcceptInvite token={Route.useParams().token} />;
  },
});
