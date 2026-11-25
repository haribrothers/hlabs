// "Make private" (US-APP-27, US-SYS-44): asked first, naming the app and its address, then a `public_off` job; the
// address stops answering within seconds. From Settings › Network, App settings and Visits.
import { useTRPCClient } from '../lib/trpc';
import { confirm } from '../lib/confirm';
import { codeLine } from '../lib/error-copy';
import { showToast } from '../lib/toasts';
import { publicCopy as copy } from '../copy/public';
import { followJob, usePublicRefresh } from './jobs';

export interface PublicTarget {
  appId: string;
  name: string;
  address: string;
}

export function useMakePrivate() {
  const client = useTRPCClient();
  const refresh = usePublicRefresh();
  return (app: PublicTarget) =>
    confirm({
      title: copy.makePrivateTitle(app.name),
      body: copy.makePrivateBody(app.address, app.name),
      confirmLabel: copy.makePrivate,
      onConfirm: async () => {
        const { jobId } = await client.apps.setPublic.mutate({ appId: app.appId, public: false });
        void followJob(client, jobId).then((job) => {
          refresh();
          if (job?.state === 'succeeded') showToast({ tone: 'success', title: copy.madePrivate(app.name) });
          else if (job?.state === 'failed')
            showToast({
              tone: 'danger',
              title: copy.makePrivateFailed(app.name),
              body: job.hlabsCode ? codeLine(job.hlabsCode) : undefined,
            });
        });
        return { jobId };
      },
    });
}
