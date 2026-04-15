'use server';

import { router } from '../router';
import { actionContext, withCacheInvalidation } from './action-context';

export const invoicingVoid = router.invoicing.void.actionable({
  context: actionContext,
  interceptors: [withCacheInvalidation('invoices')],
});
