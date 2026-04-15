'use server';

import { router } from '../router';
import { actionContext, withCacheInvalidation } from './action-context';

export const invoicingCalculateLateFee = router.invoicing.calculateLateFee.actionable({
  context: actionContext,
  interceptors: [withCacheInvalidation('invoices')],
});
