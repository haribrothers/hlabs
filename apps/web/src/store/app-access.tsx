// Requirements and access on AppDetails (US-STORE-07): warnings when the app wants more memory or disk than this
// computer has, what it can reach in plain words (Docker access and raw ports marked risky), and apps it needs first.
import type { StoreAppDetails } from '@hlabs/api';
import { AlertTriangle, iconDefaults } from '@hlabs/icons';
import { Badge } from '@hlabs/ui';
import { Link } from '@tanstack/react-router';
import { storeCopy } from '../copy/store';

const copy = storeCopy;

/** Binary GB with one decimal under 10, like the manifest's MB (2048 → "2"). */
export const gb = (bytes: number) => {
  const v = bytes / 2 ** 30;
  return String(v < 10 ? Math.round(v * 10) / 10 : Math.round(v));
};

export interface Blockers {
  memoryWarning: string | null;
  diskWarning: string | null;
  missing: StoreAppDetails['dependsOn'];
  /** Install can't go ahead: not enough disk, or an app it needs isn't installed. */
  blocksInstall: boolean;
}

export function blockers(d: StoreAppDetails): Blockers {
  const r = d.requirements;
  const memoryWarning =
    r.memoryBytes !== null && r.memoryFreeBytes !== null && r.memoryBytes > r.memoryFreeBytes
      ? copy.memoryWarning(gb(r.memoryBytes), gb(r.memoryFreeBytes))
      : null;
  const diskWarning =
    r.diskBytes !== null && r.diskFreeBytes !== null && r.diskBytes > r.diskFreeBytes
      ? copy.diskWarning(gb(r.diskBytes), gb(r.diskFreeBytes))
      : null;
  const missing = d.dependsOn.filter((dep) => !dep.installed);
  return { memoryWarning, diskWarning, missing, blocksInstall: diskWarning !== null || missing.length > 0 };
}

/** The notes above the facts: requirements that aren't met and apps to install first. */
export function RequirementNotes({ d }: { d: StoreAppDetails }) {
  const b = blockers(d);
  if (!b.memoryWarning && !b.diskWarning && b.missing.length === 0) return null;
  // Memory is a recommendation (install still allowed); disk and missing apps stop the install.
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0">
      {b.memoryWarning ? (
        <li className="flex items-center gap-2 text-body-sm text-warning">
          <AlertTriangle aria-hidden {...iconDefaults} className="size-4 shrink-0" />
          {b.memoryWarning}
        </li>
      ) : null}
      {b.diskWarning ? (
        <li className="flex items-center gap-2 text-body-sm text-danger">
          <AlertTriangle aria-hidden {...iconDefaults} className="size-4 shrink-0" />
          {b.diskWarning}
        </li>
      ) : null}
      {b.missing.map((dep) => (
        <li key={dep.appId} className="text-body-sm">
          <Link to="/store/app/$appId" params={{ appId: dep.appId }} className="hl-focus rounded-xs text-accent">
            {copy.needsFirst(dep.name)}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Row({ title, detail, risky }: { title: string; detail?: string; risky?: boolean }) {
  return (
    <li className="flex items-start justify-between gap-3 rounded-md bg-surface-row px-4 py-3">
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-body-sm font-semibold">{title}</span>
        {detail ? <span className="text-caption text-ink-muted">{detail}</span> : null}
      </span>
      {risky ? <Badge tone="danger">{copy.risky}</Badge> : null}
    </li>
  );
}

/** What the app can reach: network, folders with their mode, raw ports, GPU and Docker. */
export function AccessList({ d }: { d: StoreAppDetails }) {
  const { access } = d;
  return (
    <section aria-labelledby="details-access" className="flex flex-col gap-2">
      <h2 id="details-access" className="m-0 text-title-2">
        {copy.access}
      </h2>
      <ul aria-labelledby="details-access" className="m-0 flex list-none flex-col gap-2 p-0">
        <Row title={copy.network[access.network]} detail={copy.networkLabel} />
        {d.folders.map((f) => (
          <Row
            key={f.key}
            title={f.label}
            detail={[copy.folderMode[f.mode], f.description].filter(Boolean).join(' · ')}
          />
        ))}
        {access.ports.map((p) => (
          <Row key={`${p.host}/${p.protocol}`} title={copy.port(p.label, p.host)} detail={copy.portNote} risky />
        ))}
        {access.gpu ? <Row title={copy.gpu} detail={copy.gpuNote} /> : null}
        {access.dockerSocket ? <Row title={copy.docker} detail={copy.dockerNote} risky /> : null}
      </ul>
    </section>
  );
}
