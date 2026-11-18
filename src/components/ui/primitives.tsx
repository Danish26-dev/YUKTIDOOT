import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';
import { cx } from '@/lib/util';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'sun';
type Size = 'sm' | 'md' | 'lg';

const variants: Record<Variant, string> = {
  primary: 'bg-cobalt text-white hover:bg-cobalt-700 active:bg-cobalt-800 shadow-sm',
  secondary: 'bg-white text-ink border border-beige-300 hover:border-ink-300 hover:bg-beige-50',
  ghost: 'text-ink-700 hover:bg-beige-200/60',
  danger: 'bg-white text-bad border border-bad/30 hover:bg-bad-50',
  sun: 'bg-sun text-ink hover:brightness-95 shadow-sm',
};
const sizes: Record<Size, string> = { sm: 'h-8 px-3 text-xs gap-1.5', md: 'h-10 px-4 text-sm gap-2', lg: 'h-12 px-5 text-[15px] gap-2' };

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = 'primary', size = 'md', loading, icon, className, children, disabled, ...rest }, ref) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cx('inline-flex shrink-0 items-center justify-center rounded-xl font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50', variants[variant], sizes[size], className)}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('card', className)} {...rest} />;
}

export function CardHeader({ title, subtitle, action, className }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cx('flex items-start justify-between gap-3 border-b border-beige-200 px-5 py-4', className)}>
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-ink-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

type Tone = 'neutral' | 'cobalt' | 'sun' | 'ok' | 'bad' | 'ink';
const tones: Record<Tone, string> = {
  neutral: 'bg-beige-100 text-ink-500 ring-beige-300',
  cobalt: 'bg-cobalt-50 text-cobalt-700 ring-cobalt-200',
  sun: 'bg-sun-50 text-sun-700 ring-sun-100',
  ok: 'bg-ok-50 text-ok ring-ok/20',
  bad: 'bg-bad-50 text-bad ring-bad/20',
  ink: 'bg-ink text-white ring-ink',
};
export function Badge({ tone = 'neutral', children, dot, className }: { tone?: Tone; children: ReactNode; dot?: boolean; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset', tones[tone], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
export type { Tone };

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="label-mono mb-2">{eyebrow}</div>}
        <h1 className="font-display text-3xl leading-tight font-semibold tracking-tight text-ink md:text-[34px]">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm text-ink-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({ label, value, sub, tone = 'neutral', icon }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'neutral' | 'cobalt' | 'sun' | 'bad'; icon?: ReactNode }) {
  const accent = { neutral: 'text-ink', cobalt: 'text-cobalt', sun: 'text-sun-700', bad: 'text-bad' }[tone];
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-ink-500">{label}</span>
        {icon && <span className="text-ink-300">{icon}</span>}
      </div>
      <div className={cx('mt-2 text-2xl font-semibold tracking-tight break-words tabular-nums', accent)}>{value}</div>
      {sub && <div className="mt-1 text-xs text-ink-400">{sub}</div>}
    </Card>
  );
}

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {icon && <div className="mb-3 grid size-12 place-items-center rounded-2xl bg-beige-100 text-ink-400">{icon}</div>}
      <p className="font-medium text-ink">{title}</p>
      {body && <p className="mt-1 max-w-sm text-sm text-ink-500">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('skeleton h-4', className)} />;
}

export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: string; error?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-medium text-ink-700">{label}</label>
      {children}
      {error ? <p className="mt-1 text-xs text-bad" role="alert">{error}</p> : hint ? <p className="mt-1 text-xs text-ink-400">{hint}</p> : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(function Input({ className, invalid, ...rest }, ref) {
  return <input ref={ref} className={cx('input', invalid && 'input-error', className)} aria-invalid={invalid || undefined} {...rest} />;
});
export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx('input min-h-24 resize-y font-[inherit]', className)} {...rest} />;
}
export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cx('input pr-8', className)} {...rest}>{children}</select>;
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: string; count?: number }[] }) {
  return (
    <div role="tablist" className="inline-flex flex-wrap gap-1 rounded-xl bg-beige-200/60 p-1">
      {items.map((it) => (
        <button
          key={it.value}
          role="tab"
          aria-selected={value === it.value}
          onClick={() => onChange(it.value)}
          className={cx('rounded-lg px-3 py-1.5 text-xs font-medium transition-colors', value === it.value ? 'bg-white text-ink shadow-sm' : 'text-ink-500 hover:text-ink')}
        >
          {it.label}
          {it.count !== undefined && <span className={cx('ml-1.5 tabular-nums', value === it.value ? 'text-cobalt' : 'text-ink-400')}>{it.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function ProgressBar({ value, tone = 'cobalt' }: { value: number; tone?: 'cobalt' | 'sun' | 'ok' }) {
  const c = { cobalt: 'bg-cobalt', sun: 'bg-sun', ok: 'bg-ok' }[tone];
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-beige-200" role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cx('h-full rounded-full transition-all duration-500', c)} style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }} />
    </div>
  );
}

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx('font-mono text-[12px]', className)}>{children}</span>;
}
