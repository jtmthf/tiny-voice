import { QueryClient } from '@tanstack/react-query';
import { createRouter, ErrorComponent } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';

function PendingComponent() {
  return (
    <div className="loading" role="status" aria-live="polite">
      Loading…
    </div>
  );
}

export function getRouter() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000 } },
  });
  return createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: 'intent',
    scrollRestoration: true,
    defaultPendingComponent: PendingComponent,
    defaultErrorComponent: ErrorComponent,
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
