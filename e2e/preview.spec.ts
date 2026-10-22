import fs from 'node:fs';
import path from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { MANAGER_DESK } from '../client/src/world/layout';
import { enterOffice, expect, startAt, test, type SavedView } from './helpers';

// The floor's app preview settings in the manager's console, against the env budget a real .env has to fit in.

// In the manager's office, just in front of the desk, looking down at the computer (-Z is north).
const AT_DESK: SavedView = { floor: 0, x: MANAGER_DESK.x, z: MANAGER_DESK.z + MANAGER_DESK.d / 2 + 0.8, yaw: 0, pitch: -0.6 };

/** Opens the console, expands the first floor's App preview details and returns its env box. */
async function openPreviewEnv(page: Page) {
  await startAt(page, AT_DESK);
  await enterOffice(page);
  await expect(page.getByText("Open the manager's console")).toBeVisible(); // the crosshair aim is live before E
  await page.keyboard.press('e'); // open the manager's console at its desk; it lands on the Floors & repos tab
  const panel = page.getByText(/Manager's console/);
  await expect(panel).toBeVisible();
  const details = page.locator('.preview-details').first();
  const summary = details.locator('summary');
  const env = details.locator('.preview-form textarea');
  // A state patch can replace the row mid-click, closing the details again: open until it stays open.
  await expect(async () => {
    if (!(await env.isVisible())) await summary.click();
    await expect(env).toBeVisible();
  }).toPass();
  return { details, env };
}

// Evidence for the pull request comes from EVIDENCE_DIR; a plain run writes nothing.
async function snapshot(page: Page, name: string, focus?: Locator) {
  const dir = process.env.EVIDENCE_DIR;
  if (!dir) return;
  const skip = page.getByRole('button', { name: 'Skip tour' });
  if (await skip.isVisible()) {
    await skip.click();
    await expect(page.locator('.tour')).toBeHidden(); // the tour popover buries the console
  }
  await focus?.evaluate((el) => el.scrollIntoView({ block: 'center' })); // the shot must show what it claims
  fs.mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, name) });
}

// A project's .env is routinely dozens of variables: that must save, and the refusals below must never fire.
const SMALL = [...Array(40).keys()].map((i) => `VITE_SETTING_${i}=http://localhost:{port}/api/${i}`).join('\n');

test('the settings box takes a project .env of dozens of variables', async ({ page }) => {
  const { details, env } = await openPreviewEnv(page);
  await env.fill(SMALL);
  await details.getByRole('button', { name: 'Save' }).click();
  await expect(details.locator('.term-error')).toHaveCount(0);
  // Saved: the patch left the box and the server took it, so the box no longer counts as dirty.
  await expect(details.locator('.preview-form').getByText('Undo changes')).toBeHidden();
  await snapshot(page, 'preview-env-saved.png', details.locator('.preview-form'));
});

test('the settings box turns away an env past the budget, and says what to do', async ({ page }) => {
  const { details, env } = await openPreviewEnv(page);
  await env.fill([...Array(60).keys()].map((i) => `VITE_SETTING_${i}=http://localhost:{port}/testbed/api/${i}/${i}/${i}`.repeat(10)).join('\n'));
  await details.getByRole('button', { name: 'Save' }).click();
  // shared/previewEnv.ts's words, refused locally before any PATCH.
  await expect(details.locator('.term-error')).toContainText(/The preview env is [\d,]+ characters \(60 variables, each counted as KEY=value\), over the 16,000 a floor's preview may take/);
  await snapshot(page, 'preview-env-over-budget.png', details.locator('.term-error'));
});
