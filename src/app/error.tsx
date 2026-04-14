'use client';

export default function ErrorBoundary({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="card" role="alert" style={{ marginTop: '2rem', textAlign: 'center' }}>
      <h2>Something went wrong</h2>
      <p style={{ color: 'var(--color-text-muted)', margin: '1rem 0' }}>
        An unexpected error occurred.
      </p>
      <button onClick={reset} className="btn-primary">
        Try again
      </button>
    </div>
  );
}
