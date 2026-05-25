import { test, expect } from '../fixtures';

test('dashboard loads @smoke', async ({ dashboardPage, page }) => {
  await dashboardPage.goto();
  await expect(page.getByRole('link', { name: 'tiny-voice' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeAttached();
  await expect(dashboardPage.getStatValue('clients')).toBeVisible();
  await expect(dashboardPage.getStatValue('invoices')).toBeVisible();
  await expect(dashboardPage.getStatValue('outstanding')).toBeVisible();
});

test('nav links navigate all routes @smoke', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible();
  await page.getByRole('link', { name: 'Clients' }).click();
  await expect(page.getByRole('heading', { name: 'Clients' })).toBeVisible();

  await page.getByRole('link', { name: 'Invoices' }).click();
  await expect(page.getByRole('heading', { name: 'Invoices' })).toBeVisible();

  await page.getByRole('link', { name: 'Reporting' }).click();
  await expect(page.getByRole('heading', { name: 'Reporting' })).toBeVisible();

  await page.getByRole('link', { name: 'tiny-voice' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
});

test('invoices list renders @smoke', async ({ page }) => {
  await page.goto('/invoices');
  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible();
  await expect(page.getByRole('combobox', { name: /filter by status/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Invoices' })).toBeVisible();
});

test('reporting page loads @smoke', async ({ page }) => {
  await page.goto('/reporting');
  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Revenue Reporting' })).toBeVisible();
});
