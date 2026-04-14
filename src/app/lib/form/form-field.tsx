export function FormField({
  label,
  name,
  type = 'text',
  required,
  ...inputProps
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'name' | 'type'>) {
  return (
    <div className="form-group">
      <label htmlFor={name}>{label}</label>
      <input id={name} name={name} type={type} required={required} {...inputProps} />
    </div>
  );
}
