'use server';

import { router } from '../router';
import { actionContext } from './action-context';

export const invoicingGeneratePdf = router.invoicing.generatePdf.actionable({
  context: actionContext,
});
