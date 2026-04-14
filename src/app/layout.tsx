import Link from 'next/link';
import './globals.css';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a href="#main-content" className="skip-link">Skip to content</a>
        <nav>
          <Link href="/" className="logo">tiny-voice</Link>
          <Link href="/clients">Clients</Link>
          <Link href="/invoices">Invoices</Link>
          <Link href="/reporting">Reporting</Link>
        </nav>
        <main id="main-content">{children}</main>
      </body>
    </html>
  );
}
