import { test as base, expect } from '@playwright/test';
import { DashboardPage } from './pages/dashboard-page';
import { NewClientPage } from './pages/new-client-page';
import { NewInvoicePage } from './pages/new-invoice-page';
import { InvoiceDetailPage } from './pages/invoice-detail-page';
import { ReportingPage } from './pages/reporting-page';

interface Fixtures {
  dashboardPage: DashboardPage;
  newClientPage: NewClientPage;
  newInvoicePage: NewInvoicePage;
  invoiceDetailPage: InvoiceDetailPage;
  reportingPage: ReportingPage;
  testClient: { id: string; name: string };
}

export const test = base.extend<Fixtures>({
  dashboardPage: async ({ page }, use) => {
    await use(new DashboardPage(page));
  },
  newClientPage: async ({ page }, use) => {
    await use(new NewClientPage(page));
  },
  newInvoicePage: async ({ page }, use) => {
    await use(new NewInvoicePage(page));
  },
  invoiceDetailPage: async ({ page }, use) => {
    await use(new InvoiceDetailPage(page));
  },
  reportingPage: async ({ page }, use) => {
    await use(new ReportingPage(page));
  },

  testClient: async ({ page, request }, use) => {
    const rawId = test.info().testId.replace(/\s+/g, '-');
    const randomSuffix = Math.random().toString(36).slice(2, 8);
    const name = `e2e-${rawId}-${randomSuffix}`.slice(0, 60);

    await page.goto('/clients/new');
    await expect(page.locator('main[data-hydrated="true"]')).toBeVisible();
    await page.getByRole('textbox', { name: 'Name' }).fill(name);
    await page.getByRole('textbox', { name: 'Email' }).fill(`${name}@e2e.test`);
    await page.getByRole('button', { name: 'Create Client' }).click();
    await page.waitForURL(/\/clients\/client_/);
    const id = /\/clients\/([^/]+)/.exec(page.url())?.[1] ?? '';

    await use({ id, name });

    if (id) {
      try {
        const response = await request.delete(`/api/clients/${id}`);
        if (!response.ok()) {
          console.warn(`Failed to clean up client ${id}: ${response.status()}`);
        }
      } catch (err) {
        console.warn(`Exception cleaning up client ${id}:`, err);
      }
    }
  },
});

export { expect };
