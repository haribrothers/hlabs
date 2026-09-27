import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useTRPC } from '../lib/trpc';
import { WelcomeStep } from '../onboarding/welcome-step';

export const Route = createFileRoute('/setup/')({ component: Welcome });

function Welcome() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const setStep = useMutation(
    trpc.onboarding.setStep.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: trpc.onboarding.status.queryKey() });
        await navigate({ to: '/setup/$step', params: { step: 'system' } });
      },
    }),
  );
  return (
    <WelcomeStep
      onStart={() => setStep.mutate({ step: 'system' })}
      pending={setStep.isPending}
      failed={setStep.isError}
    />
  );
}
