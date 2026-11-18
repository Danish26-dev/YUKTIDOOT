import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Camera, FileJson, FileSpreadsheet, FileText, FolderOpen, Receipt, Search, Trash2, HelpCircle } from 'lucide-react';
import type { DocumentItem } from '@/types';
import { useAppState } from '@/store/store';
import { deleteDocument, reclassifyDocument, uploadDocument } from '@/store/actions';
import { Badge, Button, Card, EmptyState, Input, PageHeader, Select, Tabs } from '@/components/ui/primitives';
import { Dropzone } from '@/components/ui/Dropzone';
import { ConfirmDialog, Modal } from '@/components/ui/overlays';
import { DOC_TYPE_LABEL, DocStatusBadge } from '@/components/domain/status';
import { InvoicePaper } from '@/components/domain/InvoiceViews';
import { fmtDateTime } from '@/lib/format';
import { cx } from '@/lib/util';

const ICON: Record<DocumentItem['type'], typeof FileText> = { purchase_invoice: FileText, receipt: Receipt, business_photo: Camera, eway_draft: FileJson, working_paper: FileSpreadsheet, other: HelpCircle };
type TypeFilter = 'all' | DocumentItem['type'];

export function DocumentsPage() {
  const s = useAppState();
  const [type, setType] = useState<TypeFilter>('all');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [preview, setPreview] = useState<DocumentItem | null>(null);
  const [toDelete, setToDelete] = useState<DocumentItem | null>(null);
  const [busy, setBusy] = useState(false);

  const list = useMemo(() => s.documents.filter((d) => (type === 'all' || d.type === type) && (!status || d.status === status) && (!q || `${d.name} ${d.note ?? ''}`.toLowerCase().includes(q.toLowerCase()))), [s.documents, type, status, q]);
  const count = (t: DocumentItem['type']) => s.documents.filter((d) => d.type === t).length;

  const onFiles = async (files: File[]) => {
    setBusy(true);
    try { for (const f of files) await uploadDocument(f); } finally { setBusy(false); }
  };

  return (
    <div>
      <PageHeader eyebrow="Document & Bookkeeping Agent" title="Documents" description="One place for every invoice, receipt, photo and generated paper. Uploads are classified automatically; invoices go straight into the invoice workflow." />

      <Card className="mb-6 p-5">
        <Dropzone multiple disabled={busy} onFiles={(f) => void onFiles(f)} title="Drop invoices, receipts or business photos" hint="Classified by file name in demo mode, e.g. “invoice…”, “receipt…”, “workshop…”. PDF, JPG, PNG, WEBP up to 10 MB." />
      </Card>

      <Card>
        <div className="flex flex-col gap-3 border-b border-beige-200 p-4 xl:flex-row xl:items-center xl:justify-between">
          <Tabs value={type} onChange={setType} items={[
            { value: 'all', label: 'All', count: s.documents.length }, { value: 'purchase_invoice', label: 'Invoices', count: count('purchase_invoice') },
            { value: 'receipt', label: 'Receipts', count: count('receipt') }, { value: 'business_photo', label: 'Photos', count: count('business_photo') },
            { value: 'eway_draft', label: 'E-way drafts', count: count('eway_draft') }, { value: 'working_paper', label: 'Working papers', count: count('working_paper') }, { value: 'other', label: 'Unclassified', count: count('other') },
          ]} />
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative"><Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-300" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search documents" className="pl-9 sm:w-56" aria-label="Search documents" /></div>
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="sm:w-44" aria-label="Filter by status">
              <option value="">Any status</option><option value="processing">Processing</option><option value="processed">Processed</option><option value="needs_review">Needs review</option>
            </Select>
          </div>
        </div>
        {list.length === 0 ? <EmptyState icon={<FolderOpen className="size-5" />} title="No documents match" body="Change the filters or upload a document above." /> : (
          <ul className="grid gap-px bg-beige-200 sm:grid-cols-2 xl:grid-cols-3">
            {list.map((d) => {
              const I = ICON[d.type];
              return (
                <li key={d.id} className="flex gap-3 bg-white p-4">
                  <span className={cx('grid size-11 shrink-0 place-items-center rounded-xl', d.status === 'needs_review' ? 'bg-sun-50 text-sun-700' : 'bg-cobalt-50 text-cobalt')}><I className="size-5" /></span>
                  <div className="min-w-0 flex-1">
                    <button onClick={() => setPreview(d)} className="block max-w-full truncate text-left text-sm font-medium hover:text-cobalt">{d.name}</button>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5"><Badge>{DOC_TYPE_LABEL[d.type]}</Badge><DocStatusBadge status={d.status} />{d.source === 'generated' && <Badge tone="cobalt">generated</Badge>}</div>
                    <p className="mt-1 truncate text-xs text-ink-400">{d.note && d.note !== 'Extracting fields…' ? d.note : `${d.sizeKb} KB`} · {fmtDateTime(d.uploadedAt)}</p>
                  </div>
                  <button onClick={() => setToDelete(d)} className="self-start rounded-lg p-1.5 text-ink-300 hover:bg-bad-50 hover:text-bad" aria-label={`Delete ${d.name}`}><Trash2 className="size-4" /></button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {preview && <Preview doc={s.documents.find((d) => d.id === preview.id) ?? preview} onClose={() => setPreview(null)} />}
      <ConfirmDialog open={!!toDelete} onClose={() => setToDelete(null)} onConfirm={() => toDelete && deleteDocument(toDelete.id)} title="Delete document?" danger confirmLabel="Delete"
        body={<>“{toDelete?.name}” will be removed. Documents that are evidence for a recorded invoice cannot be deleted.</>} />
    </div>
  );
}

function Preview({ doc, onClose }: { doc: DocumentItem; onClose: () => void }) {
  const s = useAppState();
  const inv = doc.type === 'purchase_invoice' ? s.invoices.find((i) => i.id === doc.linkedId) : undefined;
  const ship = doc.type === 'eway_draft' ? s.shipments.find((x) => x.id === doc.linkedId) : undefined;
  return (
    <Modal open onClose={onClose} title={doc.name} subtitle={`${DOC_TYPE_LABEL[doc.type]} · ${doc.sizeKb} KB · ${doc.source}`} size="lg"
      footer={<>{inv && <Link to={`/invoices?open=${inv.id}`}><Button variant="secondary">Open invoice</Button></Link>}{ship && <Link to={`/dispatch?open=${ship.id}`}><Button variant="secondary">Open shipment</Button></Link>}{doc.type === 'working_paper' && <Link to="/compliance"><Button variant="secondary">Open in Compliance</Button></Link>}<Button onClick={onClose}>Done</Button></>}>
      {inv && inv.lines.length ? <InvoicePaper invoice={inv} buyerName={s.profile.businessName} /> : ship ? (
        <pre className="overflow-x-auto rounded-xl bg-ink p-4 font-mono text-xs text-beige">{JSON.stringify({ _note: 'SIMULATED draft, not submitted', supplyType: 'Outward', subType: 'Supply', docNo: ship.invoiceNumber, toGstin: ship.consigneeGstin, toPincode: ship.toPin, hsnCode: ship.hsn, totalValue: ship.value, transMode: 'Road', transDistance: ship.distanceKm, vehicleNo: ship.vehicleNumber || null, ewbNo: ship.ewbNumber ?? null }, null, 2)}</pre>
      ) : doc.type === 'business_photo' ? (
        <div className="space-y-3"><img src="/samples/workshop.svg" alt="Workshop (sample illustration)" className="w-full rounded-xl border border-beige-200" /><p className="text-xs text-ink-400">{doc.source === 'upload' ? 'Your photo is not kept after upload in demo mode; the sample illustration is shown instead.' : 'Sample illustration used for the demo.'}</p><Link to="/profile"><Button variant="secondary" size="sm">Use for business understanding</Button></Link></div>
      ) : (
        <div className="space-y-4 text-sm">
          <p className="text-ink-500">{doc.note ?? 'No preview available in demo mode.'}</p>
          {doc.type === 'other' && (
            <div><p className="mb-2 text-xs font-medium text-ink-700">What is this document?</p>
              <div className="flex flex-wrap gap-2">{(['receipt', 'business_photo'] as const).map((t) => <Button key={t} size="sm" variant="secondary" onClick={() => { reclassifyDocument(doc.id, t); onClose(); }}>{DOC_TYPE_LABEL[t]}</Button>)}</div>
              <p className="mt-2 text-xs text-ink-400">For a purchase invoice, upload it from the Invoices page so it runs through the full workflow.</p>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
