import { expect, type Page, type Locator } from '@playwright/test';

export class ReportingPage {
  readonly revenueTable: Locator;

  constructor(private page: Page) {
    this.revenueTable = page.getByRole('table');
  }

  async goto() {
    await this.page.goto('/reporting');
    await expect(this.page.locator('main[data-hydrated="true"]')).toBeVisible();
  }

  getEmptyState(): Locator {
    return this.page.getByRole('status');
  }
}
