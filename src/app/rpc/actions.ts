'use server';

import { updateTag } from 'next/cache';
import { router } from './router';

async function actionContext() {
  const { getRpcContext } = await import('./get-rpc-context');
  return getRpcContext();
}

function withCacheInvalidation(...tags: string[]) {
  return async function <T>(options: { next(): Promise<T> }): Promise<T> {
    const result = await options.next();
    for (const tag of tags) updateTag(tag);
    return result;
  };
}

export const actions = {
  clients: {
    create: router.clients.create.actionable({
      context: actionContext,
      interceptors: [withCacheInvalidation('clients')],
    }),
  },
  invoicing: {
    create: router.invoicing.create.actionable({
      context: actionContext,
      interceptors: [withCacheInvalidation('invoices')],
    }),
    addLineItem: router.invoicing.addLineItem.actionable({
      context: actionContext,
      interceptors: [withCacheInvalidation('invoices')],
    }),
    send: router.invoicing.send.actionable({
      context: actionContext,
      interceptors: [withCacheInvalidation('invoices')],
    }),
    recordPayment: router.invoicing.recordPayment.actionable({
      context: actionContext,
      interceptors: [withCacheInvalidation('invoices', 'revenue')],
    }),
    void: router.invoicing.void.actionable({
      context: actionContext,
      interceptors: [withCacheInvalidation('invoices')],
    }),
    calculateLateFee: router.invoicing.calculateLateFee.actionable({
      context: actionContext,
      interceptors: [withCacheInvalidation('invoices')],
    }),
    generatePdf: router.invoicing.generatePdf.actionable({
      context: actionContext,
    }),
  },
};
