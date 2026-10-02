import { createFileRoute } from '@tanstack/react-router';
import { AcceptInvite } from '../login/accept-invite';

export const Route = createFileRoute('/invite/$token')({
  // ?preview=1: the admin's look at the page (US-ACCT-23); the form can't be sent.
  validateSearch: (search: Record<string, unknown>): { preview?: boolean } =>
    search.preview === 1 || search.preview === '1' || search.preview === true ? { preview: true } : {},
  component: function Invite() {
    return <AcceptInvite token={Route.useParams().token} preview={Route.useSearch().preview === true} />;
  },
});
