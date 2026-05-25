import { test, expect } from '../fixtures';

test('revenue updates after recording payment @full',
  async ({ testClient, newInvoicePage, invoiceDetailPage, reportingPage, page }) => {

  await newInvoicePage.goto();
  await newInvoicePage.selectClient(testClient.id);
  await newInvoicePage.taxRateInput.fill('0');
  await newInvoicePage.dueDateInput.fill('2026-12-31');
  await newInvoicePage.fillLineItem(0, 'Service', '1', '750000');
  await newInvoicePage.submit();
  await expect(page).toHaveURL(/\/invoices\/inv_/);

  await invoiceDetailPage.sendBtn.click();
  await expect(invoiceDetailPage.statusBadge).toContainText('sent');
  await invoiceDetailPage.recordPayment('750000');
  await expect(invoiceDetailPage.statusBadge).toContainText('paid');

  await reportingPage.goto();
  await expect(page.getByRole('heading', { name: 'Revenue Reporting' })).toBeVisible();
  await expect(reportingPage.revenueTable).toBeVisible();
});
