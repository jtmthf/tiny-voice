'use server';

import { router } from '../router';
import { actionContext, withCacheInvalidation } from './action-context';

export const invoicingSend = router.invoicing.send.actionable({
  context: actionContext,
  interceptors: [withCacheInvalidation('invoices')],
});
