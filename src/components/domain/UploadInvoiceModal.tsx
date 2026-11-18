import { useState } from 'react';
import { FileText, ImageOff, PackageCheck, PackageX, Wrench } from 'lucide-react';
import { Modal } from '@/components/ui/overlays';
import { Dropzone } from '@/components/ui/Dropzone';
import { SAMPLE_INVOICES, type SampleInvoice } from '@/data/samples';
import { uploadInvoice, uploadSampleInvoice } from '@/store/actions';
import { cx } from '@/lib/util';

const ICON: Record<string, typeof FileText> = { ganesh_mismatch: Wrench, patel_matched: PackageCheck, kaveri_missing: PackageX, blurry_photo: ImageOff };
const TONE: Record<string, string> = { ganesh_mismatch: 'bg-bad-50 text-bad', patel_matched: 'bg-ok-50 text-ok', kaveri_missing: 'bg-sun-50 text-sun-700', blurry_photo: 'bg-beige-100 text-ink-500' };

/** onStarted must close the modal itself (one URL update), otherwise two router updates race. */
export function UploadInvoiceModal({ open, onClose, onStarted }: { open: boolean; onClose: () => void; onStarted: (invoiceId: string) => void }) {
  const [busy, setBusy] = useState(false);
  const go = async (p: Promise<string | null>) => {
    setBusy(true);
    try { const id = await p; if (id) onStarted(id); else onClose(); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Upload a purchase invoice" subtitle="YUKTIDOOT extracts it, checks it against the supplier’s GST record and verifies the result." size="lg">
      <Dropzone disabled={busy} title="Drop an invoice PDF or photo, or click to browse" onFiles={(f) => void go(uploadInvoice(f[0]))} />
      <p className="mt-2 text-xs text-ink-400">
        Demo mode: extraction is simulated. Your file stays in the browser. Each upload maps to one of the sample invoices below (by filename keyword, otherwise the next unused one).
      </p>
      <div className="mt-6">
        <div className="label-mono mb-2">Or use a sample invoice</div>
        <div className="grid gap-3 sm:grid-cols-2">
          {SAMPLE_INVOICES.map((smp: SampleInvoice) => {
            const I = ICON[smp.key];
            return (
              <button key={smp.key} disabled={busy} onClick={() => void go(uploadSampleInvoice(smp.key))} data-sample={smp.key}
                className="flex items-start gap-3 rounded-2xl border border-beige-200 bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-cobalt/40 hover:shadow-card disabled:opacity-50">
                <span className={cx('grid size-10 shrink-0 place-items-center rounded-xl', TONE[smp.key])}><I className="size-5" /></span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-ink">{smp.label}</span>
                  <span className="mt-0.5 block text-xs text-ink-500">{smp.hint}</span>
                  <span className="mt-1 block truncate font-mono text-[11px] text-ink-400">{smp.fileName}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
