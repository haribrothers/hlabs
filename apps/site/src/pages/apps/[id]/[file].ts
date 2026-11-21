// Each app's logo and screenshots, served from its folder in store/ when the site builds (US-SITE-03, US-SITE-04).
import { readFileSync } from 'node:fs';
import type { APIRoute, GetStaticPaths } from 'astro';
import { contentTypeOf, storeApps } from '../../../lib/store';

export const getStaticPaths = (() =>
  storeApps().flatMap((app) =>
    [app.logoFile, ...app.screenshots]
      .filter((f) => f !== null)
      .map((f) => ({ params: { id: app.id, file: f.url.split('/').at(-1)! }, props: { file: f.file } })),
  )) satisfies GetStaticPaths;

export const GET: APIRoute = ({ props }) => {
  const file = (props as { file: string }).file;
  return new Response(readFileSync(file), { headers: { 'content-type': contentTypeOf(file) } });
};
