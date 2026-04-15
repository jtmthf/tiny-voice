'use server';

import { router } from '../router';
import { actionContext, withCacheInvalidation } from './action-context';

export const invoicingAddLineItem = router.invoicing.addLineItem.actionable({
  context: actionContext,
  interceptors: [withCacheInvalidation('invoices')],
});
