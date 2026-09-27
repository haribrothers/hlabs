import { createFileRoute } from '@tanstack/react-router';
import { shellCopy } from '../copy/shell';

// Home: greeting, widgets and the app grid arrive in phase 1–2 (US-HOME-01…05).
export const Route = createFileRoute('/')({
  component: () => <h1 className="sr-only">{shellCopy.homeHeading}</h1>,
});
