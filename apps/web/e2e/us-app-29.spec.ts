// US-APP-29 · See who visits a public app (first-run instance, the pretend Cloudflare; desktop and phone): more than
// 20 failed sign-ins from one address in 10 minutes refuse it for an hour and warn the admins ("Someone keeps trying
// to sign in to <App>", with Make private and See visits); Visits lists the requests with their address, country, page
// and result, filtered by result; members never see it. The access log lines are written as Caddy's public listener
// writes them (POST /dev/public-visit): there's no Caddy in e2e.
import { expect, test } from '@playwright/test';
import { FIRST_RUN_URL } from './instances';
import { createMember, signedInAs } from './invites';
import { finishOnboardingWithTwoFactor } from './onboarding';
import { atPublicAddress, cloudflare, fakeApp, makePublic, removeFakeApp } from './public-apps';

test.use({ baseURL: FIRST_RUN_URL });

const ID = 'app29-photos';
const NAME = 'Photos demo';
const HOST = 'photos.example.com';
const ATTACKER = '203.0.113.24';

test.beforeEach(async ({ page, request }) => {
  await finishOnboardingWithTwoFactor(page, request);
  await cloudflare(request, { reset: true, setUp: true });
  await fakeApp(request, ID, NAME, 12491);
  await makePublic(page, ID, 'photos');
});
test.afterEach(async ({ request }) => {
  await cloudflare(request, { reset: true });
  await removeFakeApp(request, ID);
});

test('US-APP-29 too many failed sign-ins refuse the address and warn; Visits shows them; Make private from the warning', async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  await page.goto('/');
  // Earlier requests in Caddy's access log for the address (written as the public listener writes it).
  const now = Date.now();
  const visit = (body: Record<string, unknown>) =>
    request.post(`${FIRST_RUN_URL}/dev/public-visit`, { data: { host: HOST, ...body } });
  await visit({
    path: '/',
    status: 302,
    ip: '198.51.100.7',
    country: 'IN',
    location: '/.hlabs/sign-in?next=/',
    at: now - 60_000,
  });
  await visit({ path: '/share/7Hq2', status: 200, ip: '198.51.100.7', country: 'IN', at: now - 30_000 });
  await visit({ path: '/.hlabs/sign-in', method: 'POST', status: 429, ip: ATTACKER, country: 'NL', at: now - 10_000 });

  const attacker = atPublicAddress(request, HOST, ATTACKER);
  let last = 0;
  for (let i = 0; i < 21; i++) {
    last = (await attacker.signIn({ username: `guess${i}`, password: 'password123', next: '/' })).status();
  }
  // The 21st failure in 10 minutes: refused, for an hour.
  expect(last).toBe(429);
  const refused = await attacker.get('/.hlabs/sign-in');
  expect(refused.status()).toBe(429);
  expect(await refused.text()).toContain('hlabs-page');
  // Anyone else still gets the sign-in.
  expect((await atPublicAddress(request, HOST, '198.51.100.7').get('/.hlabs/sign-in')).status()).toBe(200);

  // The admins are warned at once.
  const warning = page.getByRole('status').filter({ hasText: `Someone keeps trying to sign in to ${NAME}` });
  await expect(warning).toBeVisible({ timeout: 15_000 });
  await expect(warning).toContainText(`from ${ATTACKER} in 10 minutes. That address is refused for an hour.`);
  await expect(warning.getByRole('button', { name: 'Make private' })).toBeVisible();

  await warning
    .getByRole('link', { name: 'See visits' })
    .or(warning.getByRole('button', { name: 'See visits' }))
    .click();
  await expect(page.getByRole('heading', { name: `Visits to ${NAME}` })).toBeVisible();
  await expect(page.getByText(`${ATTACKER} is refused until`)).toBeVisible();
  await expect(page.getByText(/It got the password wrong \d+ times in 10 minutes\./)).toBeVisible();
  await expect(page.getByText('Netherlands').first()).toBeVisible();
  await expect(page.getByText('India').first()).toBeVisible();
  await expect(page.getByText('/share/7Hq2')).toBeVisible();

  const show = page.getByRole('group', { name: 'Show' });
  await show.getByRole('button', { name: 'Signed in' }).click();
  await expect(show.getByRole('button', { name: 'Signed in' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('/share/7Hq2')).toBeVisible();
  await expect(page.getByText('Netherlands')).toHaveCount(0);
  await show.getByRole('button', { name: 'Too many tries' }).click();
  await expect(page.getByText('Netherlands').first()).toBeVisible();
  await expect(page.getByText('/share/7Hq2')).toHaveCount(0);

  // "Make private" from Visits: asked first, then the address stops answering.
  await page
    .getByRole('region', { name: `Visits to ${NAME}` })
    .getByRole('button', { name: 'Make private' })
    .click();
  await page
    .getByRole('alertdialog', { name: `Make ${NAME} private?` })
    .getByRole('button', { name: 'Make private' })
    .click();
  await expect(page.getByRole('status').filter({ hasText: `${NAME} is private` })).toBeVisible({ timeout: 15_000 });
  expect((await atPublicAddress(request, HOST, '198.51.100.7').get('/.hlabs/sign-in')).status()).toBe(404);
});

test('US-APP-29 members never see Visits', async ({ page, request, browser }, info) => {
  test.skip(info.project.name.includes('phone'), 'the same answer on a phone');
  test.setTimeout(90_000);
  const member = await createMember(page, request, FIRST_RUN_URL, { name: 'Ravi', apps: [NAME] });
  const ravi = await signedInAs(browser, {}, FIRST_RUN_URL, member);
  await ravi.goto(`/?settings=${ID}&view=visits`);
  await expect(ravi.getByText("You don't have access to this")).toBeVisible();
  await expect(ravi.getByRole('heading', { name: `Visits to ${NAME}` })).toHaveCount(0);
  await ravi.context().close();
});
