export function FormError({ error }: { error: string | null }) {
  if (!error) return null;

  return (
    <p className="error-message" aria-live="polite">
      {error}
    </p>
  );
}
