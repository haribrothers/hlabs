import { createFileRoute } from '@tanstack/react-router';
import { StoreLayout } from '../store/store-layout';

export const Route = createFileRoute('/store')({
  component: StoreLayout,
});
