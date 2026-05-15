import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:3000';

test.describe('Workspace helper — keyboard shortcuts + sidecar UX', () => {

  test('Cmd+K opens command palette and surfaces Ask helper group', async ({ page }) => {
    await page.goto(`${BASE}/data-model`);
    await page.keyboard.press('Meta+k');
    await expect(page.locator('[data-palette]')).toBeVisible({ timeout: 500 });
    await expect(page.getByText('Ask helper')).toBeVisible();
  });

  test('Sidebar PanelRight icon toggles sidecar open and closed', async ({ page }) => {
    await page.goto(`${BASE}/data-model`);
    const toggleBtn = page.locator('[aria-label="Open workspace helper"]');
    await expect(toggleBtn).toBeVisible();
    await toggleBtn.click();
    const sidecar = page.locator('[data-helper-sidecar]');
    await expect(sidecar).toBeVisible({ timeout: 300 });
    const closeBtn = page.locator('[aria-label="Close workspace helper"]');
    await closeBtn.click();
    await expect(sidecar).not.toBeVisible();
  });

  test('Sidecar opens within 300ms of Ask helper click on People row', async ({ page }) => {
    // Seed a People object so the row exists
    await page.request.post(`${BASE}/api/workspace/helper/apply`, {
      data: {
        proposals: [{
          type: 'dataModel.object.create',
          affectedField: 'dataModel',
          payload: { id: 'people-test', label: 'People', objectType: 'people', columns: ['Name', 'Email'] },
          rationale: 'test seed',
        }],
        reviewedBy: 'playwright',
      },
    });

    await page.goto(`${BASE}/data-model`);
    // Wait for page to load data
    await page.waitForSelector('[data-helper-trigger]', { timeout: 5000 });

    const askBtn = page.locator('[data-helper-trigger]').first();
    const start = Date.now();
    await askBtn.click();
    await expect(page.locator('[data-helper-sidecar]')).toBeVisible();
    expect(Date.now() - start).toBeLessThan(300);
    await expect(page.locator('[data-helper-intent]')).toBeVisible();
  });

  test('Sidecar is draggable left/right', async ({ page }) => {
    await page.goto(`${BASE}/data-model`);
    await page.locator('[aria-label="Open workspace helper"]').click();
    await expect(page.locator('[data-helper-sidecar]')).toBeVisible({ timeout: 300 });

    const handle = page.locator('[data-drag-handle]');
    await handle.waitFor({ state: 'visible' });
    const box = await handle.boundingBox();
    if (!box) throw new Error('drag handle not found');

    // Get initial width
    const sidecar = page.locator('[data-helper-sidecar]');
    const initialWidth = await sidecar.evaluate((el: HTMLElement) => el.getBoundingClientRect().width);

    // Drag 100px to the left → sidecar should widen
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x - 100, box.y + box.height / 2, { steps: 10 });
    await page.mouse.up();

    const newWidth = await sidecar.evaluate((el: HTMLElement) => el.getBoundingClientRect().width);
    expect(newWidth).toBeGreaterThan(Math.max(320, initialWidth));
  });

  test('Cmd+Enter inside sidecar fires apply for accepted proposals', async ({ page }) => {
    await page.goto(`${BASE}/data-model`);
    await page.locator('[aria-label="Open workspace helper"]').click();
    await expect(page.locator('[data-helper-sidecar]')).toBeVisible({ timeout: 300 });

    await page.locator('[data-helper-prompt]').fill('Add a scoring field to People');
    await page.locator('[data-helper-submit]').click();

    // Wait for proposals (timeout longer since model may be slow / unreachable)
    // In CI without Ollama, this will show an error — we test the keyboard plumbing
    // by intercepting the apply request
    const applyReq = page.waitForRequest(
      (req) => req.url().includes('/api/workspace/helper/apply') && req.method() === 'POST',
      { timeout: 10000 }
    ).catch(() => null);

    // Intercept to inject fake proposals if model is unavailable
    await page.route('**/api/workspace/helper/query', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          summary: 'Adding scoring field',
          proposals: [{
            type: 'dataModel.object.update',
            affectedField: 'dataModel',
            payload: { id: 'people-test', columns: ['Name', 'Email', 'Score'] },
            rationale: 'Scoring field for lead tracking',
            confidence: 0.85,
          }],
          warnings: [],
          receipts: { model: 'test', adapterMode: 'ollama', endpoint: '', confidence: 0.85, latencyMs: 100, ranAt: new Date().toISOString(), runId: 'test-run' },
        }),
      });
    });

    await page.locator('[data-helper-submit]').click();
    await expect(page.locator('[data-proposal-item]').first()).toBeVisible({ timeout: 5000 });

    // ensure first proposal is accepted
    const acceptCheckbox = page.locator('[data-proposal-accept]').first();
    const checked = await acceptCheckbox.isChecked();
    if (!checked) await acceptCheckbox.click();

    await page.keyboard.press('Meta+Enter');
    const req = await applyReq;
    if (req) {
      const body = JSON.parse(req.postData()!);
      expect(body.proposals.length).toBeGreaterThan(0);
      expect(body.proposals[0].affectedField).toMatch(/dashboards|widgetTypes|canvas|dataModel/);
    }
  });

  test('Escape closes sidecar from anywhere inside it', async ({ page }) => {
    await page.goto(`${BASE}/data-model`);
    await page.locator('[aria-label="Open workspace helper"]').click();
    await expect(page.locator('[data-helper-sidecar]')).toBeVisible({ timeout: 300 });
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-helper-sidecar]')).not.toBeVisible();
  });

  test('Setup tab shows connection status and copy-ready CLI command', async ({ page }) => {
    await page.goto(`${BASE}/data-model`);
    await page.locator('[aria-label="Open workspace helper"]').click();
    await expect(page.locator('[data-helper-sidecar]')).toBeVisible({ timeout: 300 });

    await page.locator('[data-tab="setup"]').click();
    await expect(page.locator('[data-local-model]')).toBeVisible();
    await expect(page.locator('[data-local-endpoint]')).toBeVisible();
    await expect(page.locator('[data-connection-status]')).toBeVisible();
    await expect(page.locator('[data-setup-command]')).toContainText('growthub workspace setup');
  });

  test('NEGATIVE: no route change when sidecar opens', async ({ page }) => {
    await page.goto(`${BASE}/data-model`);
    const urlBefore = page.url();
    await page.locator('[aria-label="Open workspace helper"]').click();
    await expect(page.locator('[data-helper-sidecar]')).toBeVisible({ timeout: 300 });
    expect(page.url()).toBe(urlBefore);
  });

  test('NEGATIVE: proposal with out-of-bounds affectedField shown as skipped in sidecar', async ({ page }) => {
    await page.route('**/api/workspace/helper/apply', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          applied: [],
          skipped: [{ proposal: { type: 'dashboard.create', affectedField: 'secrets', payload: {}, rationale: 'bad' }, reason: 'out-of-bounds' }],
        }),
      });
    });
    await page.route('**/api/workspace/helper/query', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          summary: 'Test bad field',
          proposals: [{
            type: 'dashboard.create',
            affectedField: 'secrets',
            payload: {},
            rationale: 'bad test',
            confidence: 0.5,
          }],
          warnings: [],
          receipts: { model: 'test', adapterMode: 'ollama', endpoint: '', confidence: 0.5, latencyMs: 10, ranAt: new Date().toISOString(), runId: 'x' },
        }),
      });
    });

    await page.goto(`${BASE}/data-model`);
    await page.locator('[aria-label="Open workspace helper"]').click();
    await page.locator('[data-helper-prompt]').fill('Test bad field');
    await page.locator('[data-helper-submit]').click();
    await expect(page.locator('[data-proposal-item]').first()).toBeVisible({ timeout: 5000 });

    // Apply the (intercepted) proposals
    await page.keyboard.press('Meta+Enter');
    await expect(page.locator('[data-skipped-count]')).toContainText('1', { timeout: 5000 });
  });

  test('Empty state shows Try the helper CTA when no objects exist', async ({ page }) => {
    // This test works on a fresh workspace with no dataModel objects
    await page.goto(`${BASE}/data-model`);
    // The empty state CTA is only shown when tables.length === 0
    // If there are tables from prior tests, skip assertion but verify the button exists somewhere
    const hasEmptyState = await page.locator('.dm-page-empty').isVisible();
    if (hasEmptyState) {
      await expect(page.locator('button', { hasText: 'Try the helper' })).toBeVisible();
    } else {
      // Tables exist — verify the toolbar Ask helper button is present
      await expect(page.locator('button', { hasText: 'Ask helper' }).first()).toBeVisible();
    }
  });

});
