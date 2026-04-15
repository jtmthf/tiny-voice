'use client';

export default function ErrorBoundary({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="card mt-lg" role="alert" style={{ textAlign: 'center' }}>
      <h2>Something went wrong</h2>
      <p className="text-muted my-md">
        An unexpected error occurred.
      </p>
      <button onClick={reset} className="btn-primary">
        Try again
      </button>
    </div>
  );
}
