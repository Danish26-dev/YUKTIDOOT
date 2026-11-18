import { useRef, useState, type ReactNode } from 'react';
import { UploadCloud } from 'lucide-react';
import { cx } from '@/lib/util';
import { ACCEPT_ATTR, MAX_UPLOAD_MB } from '@/services/extraction';

export function Dropzone({ onFiles, title = 'Drop files here or browse', hint, accept = ACCEPT_ATTR, multiple = false, disabled, icon }: {
  onFiles: (files: File[]) => void; title?: string; hint?: ReactNode; accept?: string; multiple?: boolean; disabled?: boolean; icon?: ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const take = (list: FileList | null) => {
    if (!list || !list.length || disabled) return;
    onFiles(multiple ? Array.from(list) : [list[0]]);
  };
  return (
    <div
      role="button"
      tabIndex={0}
      aria-disabled={disabled}
      onClick={() => !disabled && input.current?.click()}
      onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !disabled) { e.preventDefault(); input.current?.click(); } }}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files); }}
      className={cx(
        'flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-colors',
        over ? 'border-cobalt bg-cobalt-50' : 'border-beige-300 bg-beige-50 hover:border-cobalt/50 hover:bg-white',
        disabled && 'pointer-events-none opacity-60',
      )}
    >
      <div className={cx('mb-3 grid size-11 place-items-center rounded-xl', over ? 'bg-cobalt text-white' : 'bg-white text-cobalt shadow-sm')}>{icon ?? <UploadCloud className="size-5" />}</div>
      <p className="text-sm font-medium text-ink">{title}</p>
      <p className="mt-1 text-xs text-ink-400">{hint ?? `PDF, JPG, PNG or WEBP · up to ${MAX_UPLOAD_MB} MB`}</p>
      <input ref={input} type="file" className="hidden" accept={accept} multiple={multiple} onChange={(e) => { take(e.target.files); e.target.value = ''; }} data-testid="file-input" />
    </div>
  );
}
