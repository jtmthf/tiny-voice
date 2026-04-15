'use server';

import { router } from '../router';
import { actionContext, withCacheInvalidation } from './action-context';

export const invoicingCreate = router.invoicing.create.actionable({
  context: actionContext,
  interceptors: [withCacheInvalidation('invoices')],
});
