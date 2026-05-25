import { test, expect } from '../fixtures';

test('full lifecycle: create invoice -> send -> record payment -> verify paid @critical',
  async ({ testClient, newInvoicePage, invoiceDetailPage, page }) => {

  await newInvoicePage.goto();
  await newInvoicePage.selectClient(testClient.id);
  await newInvoicePage.taxRateInput.fill('0');
  await newInvoicePage.dueDateInput.fill('2026-12-31');
  await newInvoicePage.fillLineItem(0, 'Consulting', '1', '500000');
  await newInvoicePage.submit();

  await expect(page).toHaveURL(/\/invoices\/inv_/);
  await expect(invoiceDetailPage.statusBadge).toContainText('draft');
  await expect(invoiceDetailPage.sendBtn).toBeVisible();

  await invoiceDetailPage.sendBtn.click();
  await expect(invoiceDetailPage.statusBadge).toContainText('sent');
  await expect(invoiceDetailPage.payBtn).toBeVisible();

  await invoiceDetailPage.recordPayment('500000');
  await expect(invoiceDetailPage.statusBadge).toContainText('paid');
});

test('void a draft invoice @critical',
  async ({ testClient, newInvoicePage, invoiceDetailPage, page }) => {

  await newInvoicePage.goto();
  await newInvoicePage.selectClient(testClient.id);
  await newInvoicePage.taxRateInput.fill('0');
  await newInvoicePage.dueDateInput.fill('2026-12-31');
  await newInvoicePage.fillLineItem(0, 'Design', '1', '100000');
  await newInvoicePage.submit();

  await expect(page).toHaveURL(/\/invoices\/inv_/);
  await expect(invoiceDetailPage.statusBadge).toContainText('draft');
  await expect(invoiceDetailPage.voidBtn).toBeVisible();

  await invoiceDetailPage.voidBtn.click();
  await expect(invoiceDetailPage.statusBadge).toContainText('void');
});

test('create invoice with multiple line items @critical',
  async ({ testClient, newInvoicePage, invoiceDetailPage, page }) => {

  await newInvoicePage.goto();
  await newInvoicePage.selectClient(testClient.id);
  await newInvoicePage.taxRateInput.fill('0');
  await newInvoicePage.dueDateInput.fill('2026-12-31');
  await newInvoicePage.addEmptyRow();
  await newInvoicePage.fillLineItem(0, 'Consulting', '2', '100000');
  await newInvoicePage.fillLineItem(1, 'Design', '1', '50000');
  await newInvoicePage.submit();

  await expect(page).toHaveURL(/\/invoices\/inv_/);
  await expect(invoiceDetailPage.getLineItemRow('Consulting')).toBeVisible();
  await expect(invoiceDetailPage.getLineItemRow('Design')).toBeVisible();
});
