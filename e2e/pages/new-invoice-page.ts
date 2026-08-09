import { expect, type Page, type Locator } from '@playwright/test';

export class NewInvoicePage {
  readonly clientSelect: Locator;
  readonly taxRateInput: Locator;
  readonly dueDateInput: Locator;
  readonly addItemBtn: Locator;
  readonly submitBtn: Locator;

  constructor(private page: Page) {
    this.clientSelect = page.getByRole('combobox', { name: 'Client' });
    this.taxRateInput = page.getByRole('spinbutton', { name: 'Tax Rate (%)' });
    this.dueDateInput = page.getByLabel('Due Date');
    this.addItemBtn = page.getByRole('button', { name: /add line item/i });
    this.submitBtn = page.getByRole('button', { name: 'Create Invoice' });
  }

  async goto() {
    await this.page.goto('/invoices/new');
    await expect(this.page.locator('main[data-hydrated="true"]')).toBeVisible();
    await expect(this.submitBtn).toBeEnabled();
  }

  async selectClient(clientId: string) {
    await this.clientSelect.waitFor();
    await this.clientSelect.selectOption({ value: clientId });
    await expect(this.clientSelect).toHaveValue(clientId);
  }

  async addEmptyRow() {
    const descriptionInputs = this.page.getByRole('textbox', { name: 'Description' });
    const currentCount = await descriptionInputs.count();
    await this.addItemBtn.click();
    await expect(descriptionInputs).toHaveCount(currentCount + 1);
  }

  async fillLineItem(index: number, description: string, qty: string, unitPriceCents: string) {
    const desc = this.page.getByRole('textbox', { name: 'Description' }).nth(index);
    await desc.fill(description);
    await expect(desc).toHaveValue(description);

    const quantity = this.page.getByRole('spinbutton', { name: 'Qty' }).nth(index);
    await quantity.fill(qty);
    await expect(quantity).toHaveValue(qty);

    const price = this.page.getByRole('spinbutton', { name: /price/i }).nth(index);
    await price.fill(unitPriceCents);
    await expect(price).toHaveValue(unitPriceCents);
  }

  async submit() {
    await this.submitBtn.click();
  }
}
