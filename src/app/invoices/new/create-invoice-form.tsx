import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { createInvoiceFn } from '@/app/fns/create-invoice';
import { parseBracketNotation } from '@/app/fns/parse-bracket-notation';
import { Field, FieldLabel, FieldControl, FieldDescription } from '@/app/lib/form/field';
import { FormError } from '@/app/lib/form/form-error';

export function CreateInvoiceForm({ clients }: { clients: { id: string; name: string }[] }) {
  const [lineItemCount, setLineItemCount] = useState(1);

  const queryClient = useQueryClient();
  const createInvoice = useServerFn(createInvoiceFn);
  const mutation = useMutation({
    mutationFn: (formData: FormData) => createInvoice({ data: parseBracketNotation(formData) }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['invoices'] }),
  });

  const addRow = () => { setLineItemCount((n) => n + 1); };
  const removeRow = (index: number) => {
    // Removing a row shifts the indices of later rows in the DOM, which would
    // misalign their name attributes (lineItems[i]) with their values.
    // For this demo app we require at least one row and only support removing
    // the last row to keep indices stable.
    if (lineItemCount > 1 && index === lineItemCount - 1) {
      setLineItemCount((n) => n - 1);
    }
  };

  return (
    <form
      action={createInvoiceFn.url}
      method="POST"
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate(new FormData(e.currentTarget));
      }}
    >
      <div className="form-group">
        <label htmlFor="clientId">Client</label>
        <select id="clientId" name="clientId" required>
          <option value="">Select a client...</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <Field className="form-group">
          <FieldLabel>Tax Rate (%)</FieldLabel>
          <FieldControl
            render={(props) => (
              <input
                {...props}
                name="taxRate"
                type="number"
                step="0.01"
                min="0"
                max="100"
                defaultValue="0"
                required
              />
            )}
          />
        </Field>
        <Field className="form-group">
          <FieldLabel>Due Date</FieldLabel>
          <FieldControl
            render={(props) => <input {...props} name="dueDate" type="date" required />}
          />
        </Field>
      </div>

      <h3 className="my-md">Line Items</h3>
      {Array.from({ length: lineItemCount }, (_, i) => (
        <div
          key={i}
          style={{
            display: 'grid',
            gridTemplateColumns: '2fr 1fr 1fr auto',
            gap: '0.5rem',
            marginBottom: '0.5rem',
            alignItems: 'end',
          }}
        >
          <Field className="form-group" style={{ margin: 0 }}>
            <FieldLabel hidden={i > 0}>Description</FieldLabel>
            <FieldControl
              render={(props) => (
                <input
                  {...props}
                  name={`lineItems[${i}][description]`}
                  type="text"
                  defaultValue=""
                  placeholder="Description"
                  required
                />
              )}
            />
          </Field>
          <Field className="form-group" style={{ margin: 0 }}>
            <FieldLabel hidden={i > 0}>Qty</FieldLabel>
            <FieldControl
              render={(props) => (
                <input
                  {...props}
                  name={`lineItems[${i}][quantity]`}
                  type="number"
                  min="1"
                  defaultValue="1"
                  required
                />
              )}
            />
          </Field>
          <Field className="form-group" style={{ margin: 0 }}>
            <FieldLabel hidden={i > 0}>Price (cents)</FieldLabel>
            <FieldControl
              render={(props) => (
                <input
                  {...props}
                  name={`lineItems[${i}][unitPriceCents]`}
                  type="number"
                  min="1"
                  defaultValue=""
                  required
                />
              )}
            />
            {i === 0 && (
              <FieldDescription className="form-hint">e.g. 5000 = $50.00</FieldDescription>
            )}
          </Field>
          <button
            type="button"
            onClick={() => { removeRow(i); }}
            disabled={lineItemCount <= 1 || i !== lineItemCount - 1}
            aria-label={`Remove line item ${i + 1}`}
            style={{ marginBottom: i === 0 ? 0 : undefined }}
          >
            <span aria-hidden="true">&times;</span>
          </button>
        </div>
      ))}
      <button type="button" onClick={addRow} className="text-sm" style={{ marginBottom: '1rem' }}>
        + Add line item
      </button>

      <FormError error={mutation.error instanceof Error ? mutation.error.message : null} />

      <div className="actions-row">
        <button type="submit" className="btn-primary" disabled={mutation.isPending}>
          {mutation.isPending ? 'Creating...' : 'Create Invoice'}
        </button>
      </div>
    </form>
  );
}
