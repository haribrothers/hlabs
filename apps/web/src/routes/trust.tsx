import { createFileRoute } from '@tanstack/react-router';
import { TrustDevice } from '../shell/trust-device';

// Trust hlabs's certificate on this device (D-097).
export const Route = createFileRoute('/trust')({ component: TrustDevice });
