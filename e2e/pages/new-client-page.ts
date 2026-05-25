import type { Page, Locator } from '@playwright/test';

export class NewClientPage {
  readonly nameInput: Locator;
  readonly emailInput: Locator;
  readonly submitBtn: Locator;

  constructor(private page: Page) {
    this.nameInput = page.getByRole('textbox', { name: 'Name' });
    this.emailInput = page.getByRole('textbox', { name: 'Email' });
    this.submitBtn = page.getByRole('button', { name: 'Create Client' });
  }

  async goto() { await this.page.goto('/clients/new'); }

  async create(name: string, email: string) {
    await this.nameInput.fill(name);
    await this.emailInput.fill(email);
    await this.submitBtn.click();
  }
}
