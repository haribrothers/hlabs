import { createFileRoute } from '@tanstack/react-router';
import { Discover } from '../store/discover';

export const Route = createFileRoute('/store/')({
  component: Discover,
});
