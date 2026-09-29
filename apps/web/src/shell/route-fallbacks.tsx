// What a route shows instead of its page (US-STATE-20), inside the shell at the same URL: FORBIDDEN from the query a
// page depends on is "You don't have access to this"; an address that matches nothing is "Page not found" (the full
// 404 page arrives in phase 8, US-STATE-21); anything else is "Something went wrong", never the raw error.
import type { ErrorComponentProps } from '@tanstack/react-router';
import { isForbidden } from '../lib/error-copy';
import { AccessDenied } from './access-denied';

export function RouteError({ error }: ErrorComponentProps) {
  if (isForbidden(error)) return <AccessDenied />;
  console.error(error);
  return <AccessDenied kind="error" />;
}

export function RouteNotFound() {
  return <AccessDenied kind="notFound" />;
}
