'use server';

import { router } from '../router';
import { actionContext, withCacheInvalidation } from './action-context';

export const clientsCreate = router.clients.create.actionable({
  context: actionContext,
  interceptors: [withCacheInvalidation('clients')],
});
