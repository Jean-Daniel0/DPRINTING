import type {
  ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes,
} from 'react';

export const cn = (...values: Array<string | false | null | undefined>): string => values.filter(Boolean).join(' ');

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'gold';
  size?: 'sm' | 'md' | 'lg';
  block?: boolean;
};

const BUTTON_VARIANTS = {
  primary: 'bg-ink-950 text-paper hover:bg-ink-800 active:bg-ink-900 border border-ink-950',
  secondary: 'bg-white/80 text-ink-950 border border-ink-200 hover:border-ink-950 hover:bg-white',
  ghost: 'bg-transparent text-ink-700 border border-transparent hover:bg-ink-100 hover:text-ink-950',
  danger: 'bg-danger text-white border border-danger hover:brightness-95',
  gold: 'bg-gold text-ink-950 border border-gold hover:bg-gold-deep',
} as const;

const BUTTON_SIZES = { sm: 'min-h-9 px-3 text-xs', md: 'min-h-11 px-5 text-sm', lg: 'min-h-13 px-7 text-base' } as const;

export function Button({ variant = 'primary', size = 'md', block, className, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-full font-semibold tracking-wide transition-[background-color,border-color,color,transform] duration-150 disabled:cursor-not-allowed disabled:opacity-40 active:translate-y-px',
        BUTTON_VARIANTS[variant], BUTTON_SIZES[size], block && 'w-full', className,
      )}
      {...rest}
    />
  );
}

export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'gold' | 'mint' | 'danger' | 'cobalt'; className?: string }) {
  const tones = {
    neutral: 'bg-ink-100 text-ink-700 border-ink-200',
    gold: 'bg-gold/20 text-ink-900 border-gold/50',
    mint: 'bg-mint/10 text-mint border-mint/30',
    danger: 'bg-danger/10 text-danger border-danger/30',
    cobalt: 'bg-cobalt-soft text-cobalt border-cobalt/20',
  } as const;
  return <span className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider', tones[tone], className)}>{children}</span>;
}

export function Notice({ children, tone = 'info', title }: { children: ReactNode; tone?: 'info' | 'warning' | 'danger' | 'success'; title?: string }) {
  const tones = {
    info: 'border-ink-200 bg-white/70 text-ink-700',
    warning: 'border-gold/60 bg-gold/10 text-ink-800',
    danger: 'border-danger/30 bg-danger/5 text-danger',
    success: 'border-mint/30 bg-mint/5 text-mint',
  } as const;
  return (
    <div className={cn('rounded-2xl border p-4 text-sm leading-relaxed', tones[tone])} role={tone === 'danger' ? 'alert' : undefined}>
      {title ? <p className="mb-1 font-semibold text-ink-950">{title}</p> : null}
      {children}
    </div>
  );
}

export function Field({ label, hint, children, htmlFor, error }: { label: string; hint?: string; children: ReactNode; htmlFor?: string; error?: string | null }) {
  return (
    <label className="block" htmlFor={htmlFor}>
      <span className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-ink-500">{label}</span>
        {hint ? <span className="text-[11px] text-ink-400">{hint}</span> : null}
      </span>
      {children}
      {error ? <span className="mt-1 block text-xs font-medium text-danger">{error}</span> : null}
    </label>
  );
}

const FIELD_CLASS = 'w-full rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 text-sm text-ink-950 shadow-[inset_0_1px_2px_rgba(10,13,20,0.04)] outline-none transition focus:border-cobalt focus:ring-2 focus:ring-cobalt/15 disabled:bg-ink-100';

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(FIELD_CLASS, className)} {...rest} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(FIELD_CLASS, 'appearance-none pr-9', className)} {...rest}>{children}</select>;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(FIELD_CLASS, 'min-h-24 resize-y', className)} {...rest} />;
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-ink-500" role="status">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-ink-300 border-t-ink-950" />
      {label ?? 'Chargement…'}
    </span>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-3xl border border-dashed border-ink-300 bg-white/50 px-6 py-12 text-center">
      <p className="font-display text-lg uppercase tracking-tight text-ink-900">{title}</p>
      {children ? <div className="mx-auto mt-2 max-w-md text-sm text-ink-500">{children}</div> : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T;
  options: { value: T; label: string; disabled?: boolean; title?: string }[];
  onChange: (value: T) => void;
  label?: string;
}) {
  return (
    <div className="flex flex-wrap gap-1 rounded-2xl border border-ink-200 bg-ink-100/60 p-1" role="group" aria-label={label}>
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          disabled={o.disabled}
          title={o.title}
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={cn(
            'min-h-9 flex-1 rounded-xl px-3 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40',
            value === o.value ? 'bg-white text-ink-950 shadow-soft' : 'text-ink-500 hover:text-ink-900',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SectionTitle({ eyebrow, title, children, action }: { eyebrow?: string; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow ? <p className="mb-1 text-xs font-bold uppercase tracking-[0.18em] text-cobalt">{eyebrow}</p> : null}
        <h2 className="font-display text-2xl uppercase tracking-tight text-ink-950 sm:text-3xl">{title}</h2>
        {children ? <div className="mt-2 max-w-2xl text-sm text-ink-500">{children}</div> : null}
      </div>
      {action}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-950/55 p-0 backdrop-blur-sm sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={title} onMouseDown={onClose}>
      <div
        className={cn('max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-paper p-5 shadow-lift sm:rounded-3xl', wide ? 'sm:max-w-4xl' : 'sm:max-w-lg')}
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="font-display text-xl uppercase tracking-tight">{title}</h2>
          <button type="button" onClick={onClose} className="min-h-10 min-w-10 rounded-full border border-ink-200 text-lg leading-none text-ink-500 hover:bg-white" aria-label="Fermer">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}
