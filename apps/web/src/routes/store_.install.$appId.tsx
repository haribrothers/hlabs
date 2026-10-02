import { createFileRoute } from '@tanstack/react-router';
import { InstallProgressPage } from '../store/install-progress';

function InstallPage() {
  const { appId } = Route.useParams();
  return <InstallProgressPage appId={appId} />;
}

// An install's progress, and what to do when it fails (US-STORE-12…14).
export const Route = createFileRoute('/store_/install/$appId')({ component: InstallPage });
