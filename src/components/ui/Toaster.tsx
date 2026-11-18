import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { dismissToast, useToasts } from '@/store/toast';
import { cx } from '@/lib/util';

const ICON = { success: CheckCircle2, error: XCircle, info: Info, warning: AlertTriangle };
const COLOR = { success: 'text-ok', error: 'text-bad', info: 'text-cobalt', warning: 'text-sun-700' };

export function Toaster() {
  const toasts = useToasts();
  return (
    // Bottom-left on desktop and top on mobile, so toasts never cover drawer/modal action buttons (bottom-right).
    <div className="pointer-events-none fixed top-3 left-1/2 z-[60] flex w-[min(380px,calc(100vw-2rem))] -translate-x-1/2 flex-col gap-2 sm:top-auto sm:bottom-4 sm:left-4 sm:translate-x-0" aria-live="polite">
      {toasts.map((t) => {
        const I = ICON[t.kind];
        return (
          <div key={t.id} role="status" className="pointer-events-auto flex gap-3 rounded-2xl border border-beige-200 bg-white p-4 shadow-pop animate-fade-up">
            <I className={cx('mt-0.5 size-5 shrink-0', COLOR[t.kind])} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">{t.title}</p>
              {t.body && <p className="mt-0.5 text-[13px] leading-snug text-ink-500">{t.body}</p>}
              {t.action && <Link to={t.action.to} onClick={() => dismissToast(t.id)} className="mt-2 inline-block text-[13px] font-medium text-cobalt hover:underline">{t.action.label} →</Link>}
            </div>
            <button onClick={() => dismissToast(t.id)} className="self-start rounded p-0.5 text-ink-300 hover:text-ink" aria-label="Dismiss"><X className="size-4" /></button>
          </div>
        );
      })}
    </div>
  );
}
