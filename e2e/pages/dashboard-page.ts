import { expect, type Page, type Locator } from '@playwright/test';

export class DashboardPage {
  private page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goto() {
    await this.page.goto('/');
    await expect(this.page.locator('main[data-hydrated="true"]')).toBeVisible();
  }

  getStatValue(label: string): Locator {
    const labelMap: Record<string, string> = {
      clients: 'Clients',
      invoices: 'Total Invoices',
      outstanding: 'Outstanding',
    };
    return this.page.getByLabel(labelMap[label] ?? label);
  }

  getEmptyState(): Locator {
    return this.page.getByRole('status');
  }
}
