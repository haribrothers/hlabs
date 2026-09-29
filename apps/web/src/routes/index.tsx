import { createFileRoute } from '@tanstack/react-router';
import { HomeView } from '../home/home-view';

export const Route = createFileRoute('/')({
  component: HomeView,
});
