'use server';

import { router } from '../router';
import { actionContext, withCacheInvalidation } from './action-context';

export const invoicingRecordPayment = router.invoicing.recordPayment.actionable({
  context: actionContext,
  interceptors: [withCacheInvalidation('invoices', 'revenue')],
});
