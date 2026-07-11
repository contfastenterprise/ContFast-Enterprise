import { AsyncLocalStorage } from 'async_hooks';

export interface RequestContext {
  companyId: string;
  userId: string;
  modo: 'PRODUCCION' | 'PRUEBA';
}

export const requestContextStore = new AsyncLocalStorage<RequestContext>();

/**
 * Returns the current request context (companyId, userId, modo) if active.
 */
export function getRequestContext(): RequestContext | undefined {
  return requestContextStore.getStore();
}

/**
 * Executes a function within the specified request context.
 */
export function runWithContext<T>(context: RequestContext, fn: () => T): T {
  return requestContextStore.run(context, fn);
}
