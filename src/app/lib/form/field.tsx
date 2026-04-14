'use client';

import { createContext, useContext, useId, type ReactElement } from 'react';

interface FieldContext {
  id: string;
  descriptionId: string;
  errorId: string;
}

const FieldContext = createContext<FieldContext | null>(null);

function useFieldContext() {
  const ctx = useContext(FieldContext);
  if (!ctx) throw new Error('Field.* components must be used within <Field>');
  return ctx;
}

export function Field({ children, ...props }: React.ComponentProps<'div'>) {
  const generatedId = useId();

  const ctx: FieldContext = {
    id: generatedId,
    descriptionId: `${generatedId}-description`,
    errorId: `${generatedId}-error`,
  };

  return (
    <FieldContext.Provider value={ctx}>
      <div {...props}>{children}</div>
    </FieldContext.Provider>
  );
}

export function FieldLabel({
  hidden,
  className,
  ...props
}: { hidden?: boolean } & React.ComponentProps<'label'>) {
  const { id } = useFieldContext();

  return (
    <label
      htmlFor={id}
      className={hidden ? 'sr-only' : className}
      {...props}
    />
  );
}

export function FieldControl({
  render,
}: {
  render: (props: { id: string; 'aria-describedby': string }) => ReactElement;
}) {
  const ctx = useFieldContext();

  return render({
    id: ctx.id,
    'aria-describedby': `${ctx.descriptionId} ${ctx.errorId}`,
  });
}

export function FieldDescription({ ...props }: React.ComponentProps<'span'>) {
  const { descriptionId } = useFieldContext();

  return <span id={descriptionId} {...props} />;
}

export function FieldError({ ...props }: React.ComponentProps<'p'>) {
  const { errorId } = useFieldContext();

  return <p id={errorId} aria-live="polite" {...props} />;
}
