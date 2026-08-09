import { expect, type Page, type Locator } from '@playwright/test';

export class ReportingPage {
  readonly revenueTable: Locator;
  private page: Page;

  constructor(page: Page) {
    this.page = page;
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
