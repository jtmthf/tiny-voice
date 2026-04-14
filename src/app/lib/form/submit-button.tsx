'use client';

import { useFormStatus } from 'react-dom';

export function SubmitButton({
  children = 'Submit',
  pendingText = 'Submitting...',
}: {
  children?: React.ReactNode;
  pendingText?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? pendingText : children}
    </button>
  );
}
