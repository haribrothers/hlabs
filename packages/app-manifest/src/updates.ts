// The built-in store's update bot (US-STORE-24, D-148, D-154): for each app, a newer release tag of the images that
// follow its version, the same pattern as today's tag and not a pre-release; the edits that move it there (version,
// revision, each tag and its multi-arch digest); and the pull request that proposes them. Never merges anything.
// No network here: the command passes in the registry and GitHub lookups.
import type { ImageManifest } from './registry';
import { parseImageRef } from './registry';

/** Tags that name a test build, never offered. */
export const PRERELEASE =
  /alpha|beta|\brc|-rc|rc\d|dev|nightly|preview|pre-?release|test|snapshot|canary|edge|unstable/i;

/** `v3.2.2` → /^v\d+\.\d+\.\d+$/: the shape new tags must have to be the same kind of release. */
export function tagShape(tag: string): RegExp {
  const pattern = tag
    .split(/(\d+)/)
    .map((part) => (/^\d+$/.test(part) ? '\\d+' : part.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')))
    .join('');
  return new RegExp(`^${pattern}$`);
}

/** Newer first is positive: compares the numbers in each tag in turn (`v3.10.0` after `v3.9.4`). */
export function compareTags(a: string, b: string): number {
  const na = (a.match(/\d+/g) ?? []).map(Number);
  const nb = (b.match(/\d+/g) ?? []).map(Number);
  for (let i = 0; i < Math.max(na.length, nb.length); i++) {
    const d = (na[i] ?? -1) - (nb[i] ?? -1);
    if (d) return d;
  }
  return 0;
}

/** The newest tag of the same shape as `current`, newer than it and not a pre-release; null when there's none. */
export function newestTag(current: string, tags: string[]): string | null {
  const shape = tagShape(current);
  const newer = tags.filter((t) => shape.test(t) && !PRERELEASE.test(t) && compareTags(t, current) > 0);
  return newer.sort(compareTags).at(-1) ?? null;
}

/** How an image's tag holds the app's version: `v` + version, version + `-apache`, or the version itself. */
export function versionInTag(tag: string, version: string): { prefix: string; suffix: string } | null {
  const i = tag.indexOf(version);
  if (i < 0) return null;
  const prefix = tag.slice(0, i);
  const suffix = tag.slice(i + version.length);
  if (prefix !== '' && prefix !== 'v') return null;
  if (suffix !== '' && !suffix.startsWith('-')) return null;
  return { prefix, suffix };
}

/** A version change that may need care: the first number moved (or, for 0.x, the second). */
export function isMajor(from: string, to: string): boolean {
  const [a0 = 0, a1 = 0] = (from.match(/\d+/g) ?? []).map(Number);
  const [b0 = 0, b1 = 0] = (to.match(/\d+/g) ?? []).map(Number);
  return a0 !== b0 || (a0 === 0 && a1 !== b1);
}

export interface AppForUpdate {
  id: string;
  name: string;
  version: string;
  /** Where the app runs, from its manifest: a new image must still run there. */
  platforms: string[];
  /** Its project's repository, for the release notes link. */
  source?: string;
  /** Each service's image as the compose file pins it (`repo:tag@sha256:…`). */
  images: Array<{ service: string; image: string }>;
}

export interface UpdatePlan {
  id: string;
  name: string;
  fromVersion: string;
  toVersion: string;
  /** The tag the newest release has on the app's main image, for the release notes. */
  tag: string;
  major: boolean;
  images: Array<{ service: string; from: string; to: string; platforms: string[] }>;
}

export type UpdateCheck =
  | { kind: 'update'; plan: UpdatePlan }
  | { kind: 'current'; id: string }
  | { kind: 'skipped'; id: string; reason: string };

export interface UpdateLookups {
  /** The image's tags, including every one pushed after `current`. */
  tags(image: string, current: string): Promise<string[]>;
  manifest(image: string): Promise<ImageManifest>;
}

/** Whether `app` has a newer release, and the exact images it would move to. */
export async function checkApp(app: AppForUpdate, look: UpdateLookups): Promise<UpdateCheck> {
  const tracked = app.images.flatMap((img) => {
    const ref = parseImageRef(img.image);
    const at = ref.tag ? versionInTag(ref.tag, app.version) : null;
    return at && ref.tag ? [{ ...img, ref, at }] : [];
  });
  if (!tracked.length)
    return { kind: 'skipped', id: app.id, reason: `no image's tag follows its version ${app.version}` };
  const lead = tracked[0]!;
  let tags: string[];
  try {
    tags = await look.tags(lead.ref.name, lead.ref.tag!);
  } catch (error) {
    return { kind: 'skipped', id: app.id, reason: (error as Error).message };
  }
  const tag = newestTag(lead.ref.tag!, tags);
  if (!tag) return { kind: 'current', id: app.id };
  const toVersion = tag.slice(lead.at.prefix.length, tag.length - lead.at.suffix.length);

  const images: UpdatePlan['images'] = [];
  for (const t of tracked) {
    const newTag = `${t.at.prefix}${toVersion}${t.at.suffix}`;
    let pin: ImageManifest;
    try {
      pin = await look.manifest(`${t.ref.name}:${newTag}`);
    } catch (error) {
      return { kind: 'skipped', id: app.id, reason: `${t.ref.name}:${newTag}: ${(error as Error).message}` };
    }
    const lost = app.platforms.filter((p) => !pin.platforms.includes(p));
    if (lost.length) {
      return { kind: 'skipped', id: app.id, reason: `${t.ref.name}:${newTag} has no ${lost.join(' or ')} image` };
    }
    images.push({
      service: t.service,
      from: t.image,
      to: `${t.ref.name}:${newTag}@${pin.digest}`,
      platforms: pin.platforms,
    });
  }
  return {
    kind: 'update',
    plan: {
      id: app.id,
      name: app.name,
      fromVersion: app.version,
      toVersion,
      tag,
      major: isMajor(app.version, toVersion),
      images,
    },
  };
}

/** The edited files: the manifest's version (revision back to 1) and every moved image. Comments stay as they are. */
export function applyPlan(
  manifestText: string,
  composeText: string,
  plan: UpdatePlan,
): { manifest: string; compose: string } {
  const manifest = manifestText
    .replace(/^version:.*$/m, `version: '${plan.toVersion}'`)
    .replace(/^revision:.*$/m, 'revision: 1');
  let compose = composeText;
  for (const img of plan.images) compose = compose.split(img.from).join(img.to);
  return { manifest, compose };
}

export const BRANCH_PREFIX = 'store-update/';
export const LABEL = 'store-update';
export const MAJOR_LABEL = 'store-update-major';

export const branchFor = (id: string) => `${BRANCH_PREFIX}${id}`;
export const prTitle = (p: UpdatePlan) => `Store: update ${p.name} to ${p.toVersion}`;

export function prBody(p: UpdatePlan, releaseNotes: string | null): string {
  return [
    `Updates **${p.name}** (\`store/apps/${p.id}\`) from ${p.fromVersion} to **${p.toVersion}**.`,
    '',
    ...p.images.map(
      (i) =>
        `- \`${i.service}\`: \`${i.from.split('@')[0]}\` → \`${i.to.split('@')[0]}\` (${i.to.split('@')[1]!.slice(0, 19)}…, ${i.platforms.filter((x) => /amd64|arm64/.test(x)).join(', ')})`,
    ),
    '',
    `Release notes: ${releaseNotes ?? 'not found on GitHub; check the project’s site'}`,
    '',
    p.major
      ? `⚠️ **This looks like a major version change** (${p.fromVersion} → ${p.toVersion}). Read the release notes for breaking changes and data migrations before merging.`
      : `Not a major version change (${p.fromVersion} → ${p.toVersion}).`,
    '',
    'The store matrix installs this app and the smoke set on this pull request (US-STORE-26). Opened by `store-updates.yml` (US-STORE-24); it is never merged automatically.',
  ].join('\n');
}

/** What opening pull requests needs from git and GitHub, so it can be tested without either. */
export interface PullRequestOps {
  /** The open pull request from this branch, if any. */
  openPullRequest(branch: string): { number: number; title: string } | null;
  /** Makes `branch` main plus these file contents in one commit, and pushes it (replacing what was there). */
  pushBranch(branch: string, files: Record<string, string>, message: string): void;
  create(branch: string, title: string, body: string, labels: string[]): number;
  edit(number: number, title: string, body: string, labels: string[]): void;
}

/** One pull request per app: opens it, or updates the open one when a newer version came out; leaves it otherwise. */
export function proposeUpdate(
  plan: UpdatePlan,
  files: Record<string, string>,
  releaseNotes: string | null,
  ops: PullRequestOps,
): { action: 'opened' | 'updated' | 'unchanged'; number: number } {
  const branch = branchFor(plan.id);
  const title = prTitle(plan);
  const labels = plan.major ? [LABEL, MAJOR_LABEL] : [LABEL];
  const open = ops.openPullRequest(branch);
  if (open && open.title === title) return { action: 'unchanged', number: open.number };
  ops.pushBranch(branch, files, title);
  const body = prBody(plan, releaseNotes);
  if (open) {
    ops.edit(open.number, title, body, labels);
    return { action: 'updated', number: open.number };
  }
  return { action: 'opened', number: ops.create(branch, title, body, labels) };
}
