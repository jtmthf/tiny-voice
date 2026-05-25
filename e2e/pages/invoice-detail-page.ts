import { expect, type Page, type Locator } from '@playwright/test';

export class InvoiceDetailPage {
  readonly sendBtn: Locator;
  readonly voidBtn: Locator;
  readonly payBtn: Locator;
  readonly amountInput: Locator;
  readonly statusBadge: Locator;
  readonly lineItemsTable: Locator;
  readonly paymentsTable: Locator;

  constructor(private page: Page) {
    this.sendBtn = page.getByRole('button', { name: 'Send Invoice' });
    this.voidBtn = page.getByRole('button', { name: 'Void' });
    this.payBtn = page.getByRole('button', { name: 'Record Payment' });
    this.amountInput = page.getByRole('spinbutton', { name: 'Amount (cents)' });
    this.statusBadge = page.getByRole('status');
    this.lineItemsTable = page.getByRole('table').first();
    this.paymentsTable = page.getByRole('table').last();
  }

  async goto(invoiceId: string) {
    await this.page.goto(`/invoices/${invoiceId}`);
    await expect(this.page.locator('main[data-hydrated="true"]')).toBeVisible();
  }

  async recordPayment(amountCents: string) {
    await this.amountInput.fill(amountCents);
    await expect(this.amountInput).toHaveValue(amountCents);
    await this.payBtn.click();
  }

  getLineItemRow(description: string): Locator {
    return this.page.getByRole('row').filter({ hasText: description });
  }
}
