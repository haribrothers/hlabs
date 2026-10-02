// US-HOME-06 · Recognise each app's state on its tile (main instance, desktop and phone). Dev-only stand-ins in
// several states; each project uses its own, and names no other spec uses, since specs run side by side.
import { expect, test } from '@playwright/test';
import { MAIN_URL } from './instances';

const STATES = [
  { state: 'stopped', name: 'Tile stopped', says: 'stopped', text: 'Stopped' },
  { state: 'error', name: 'Tile broken', says: 'error', text: 'Error' },
  { state: 'starting', name: 'Tile starting', says: 'starting', text: 'Starting…' },
  { state: 'installing', name: 'Tile install', says: 'installing, 0%', text: 'Installing… 0%' },
] as const;
const id = (state: string, project: string) => `tile-${state}-${project}`;

test.afterEach(async ({ request }, info) => {
  for (const { state } of STATES) {
    await request.post(`${MAIN_URL}/dev/fake-app`, { data: { id: id(state, info.project.name), remove: true } });
  }
});

test('US-HOME-06 each tile shows and says its app state', async ({ page, request }, info) => {
  const project = info.project.name;
  for (const { state, name } of STATES) {
    await request.post(`${MAIN_URL}/dev/fake-app`, {
      data: { id: id(state, project), name: `${name} ${project}`, state },
    });
  }
  await page.goto('/');
  const grid = page.getByRole('list', { name: 'Apps' });
  for (const { name, says, text } of STATES) {
    await expect(grid.getByRole('button', { name: `${name} ${project}, ${says}`, exact: true })).toContainText(text);
  }
});
