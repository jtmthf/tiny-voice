import { useState, useEffect, type ReactNode } from 'react';
import { createRootRouteWithContext, HeadContent, Link, Outlet, Scripts } from '@tanstack/react-router';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';

interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'tiny-voice' },
    ],
    links: [
      { rel: 'stylesheet', href: '/globals.css' },
      { rel: 'icon', href: '/favicon.ico', type: 'image/x-icon' },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <RootDocument><Outlet /></RootDocument>
    </QueryClientProvider>
  );
}

function RootDocument({ children }: { readonly children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => { setHydrated(true); }, []);

  return (
    <html lang="en">
      <head><HeadContent /></head>
      <body>
        <a href="#main-content" className="skip-link">Skip to content</a>
        <nav>
          <Link to="/" className="logo">tiny-voice</Link>
          <Link to="/clients">Clients</Link>
          <Link to="/invoices" search={{ status: undefined }}>Invoices</Link>
          <Link to="/reporting">Reporting</Link>
        </nav>
        <main id="main-content" data-hydrated={hydrated}>{children}</main>
        <Scripts />
      </body>
    </html>
  );
}
