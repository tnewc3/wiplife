import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  /** Stretch to the full width of the container. */
  block?: boolean;
  size?: 'md' | 'lg';
}

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-accent-contrast active:bg-accent-hover',
  secondary: 'bg-surface text-text border border-border active:bg-surface-2',
  ghost: 'bg-transparent text-accent active:bg-surface-2',
  danger: 'bg-danger text-danger-contrast active:opacity-90',
};

/** Every button is at least 44px tall (docs/design.md, section K). */
export function Button({ variant = 'primary', block = false, size = 'md', className = '', type = 'button', ...rest }: ButtonProps) {
  const sizing = size === 'lg' ? 'min-h-14 px-6 text-lg' : 'min-h-11 px-4 text-base';
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 ${sizing} ${variants[variant]} ${block ? 'w-full' : ''} ${className}`}
      {...rest}
    />
  );
}
