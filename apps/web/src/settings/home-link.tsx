// The home-network form of a link, under the tailnet one while remote access is on (D-109): "At home" with Copy.
import { helpUrl } from '@hlabs/shared';
import { Button } from '@hlabs/ui';
import { peopleCopy as copy } from '../copy/people';
import { showToast } from '../lib/toasts';

export function HomeLink({ url, familyHint = false }: { url: string; familyHint?: boolean }) {
  const copyIt = () =>
    navigator.clipboard.writeText(url).then(
      () => showToast({ tone: 'success', title: copy.linkCopied }),
      () => showToast({ tone: 'danger', title: copy.copyFailed }),
    );
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2 text-body-sm text-ink-muted">
        <span className="font-semibold text-ink">{copy.atHome}</span>
        <span className="min-w-0 break-all font-mono text-mono">{url}</span>
        <Button variant="secondary" size="sm" aria-label={copy.copyHomeLink} onClick={() => void copyIt()}>
          {copy.copy}
        </Button>
      </div>
      {familyHint ? (
        <p className="m-0 text-body-sm text-ink-muted">
          {copy.awayHint}{' '}
          <a
            href={helpUrl('remote-access/family')}
            target="_blank"
            rel="noopener noreferrer"
            className="hl-focus rounded-xs font-semibold text-accent-link no-underline"
          >
            {copy.howTo}
          </a>
        </p>
      ) : null}
    </div>
  );
}
