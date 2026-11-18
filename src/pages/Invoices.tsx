import { useMemo, useState } from 'react';
import { EditFollowUpModal } from '@/components/domain/EditFollowUpModal';
import { Link, useSearchParams } from 'react-router-dom';
import { FileSearch, FileText, RefreshCcw, Search, Upload } from 'lucide-react';
import type { Invoice } from '@/types';
import { useAppState } from '@/store/store';
import { simulateSupplierCorrection } from '@/store/actions';
import { Badge, Button, Card, EmptyState, Input, PageHeader, Select, Skeleton, Tabs } from '@/components/ui/primitives';
import { Drawer } from '@/components/ui/overlays';
import { InvoiceStatusBadge } from '@/components/domain/status';
import { UploadInvoiceModal } from '@/components/domain/UploadInvoiceModal';
import { RunTimeline } from '@/components/domain/RunTimeline';
import { ExtractedFields, InvoicePaper, ReconTable, VerificationList } from '@/components/domain/InvoiceViews';
import { fmtDate, inr, pct } from '@/lib/format';
import { totalTax } from '@/lib/gst';

type Filter = 'all' | 'attention' | 'ok' | 'processing';
const ATTENTION = ['mismatch', 'missing_in_gst', 'followup_pending', 'followup_approved', 'extraction_failed', 'duplicate'];

export function InvoicesPage() {
  const s = useAppState();
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [supplier, setSupplier] = useState('');
  const uploadOpen = params.get('upload') === '1';
  const openId = params.get('open');

  const setParam = (k: string, v: string | null) => {
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      if (v === null) p.delete(k); else p.set(k, v);
      return p;
    }, { replace: true });
  };

  const rows = useMemo(() => s.invoices.filter((i) => {
    if (filter === 'attention' && !ATTENTION.includes(i.status)) return false;
    if (filter === 'ok' && !['matched', 'resolved'].includes(i.status)) return false;
    if (filter === 'processing' && i.status !== 'processing') return false;
    if (supplier && i.supplierId !== supplier) return false;
    if (q && !`${i.number} ${i.supplierName} ${i.supplierGstin}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }), [s.invoices, filter, supplier, q]);

  const counts = {
    all: s.invoices.length,
    attention: s.invoices.filter((i) => ATTENTION.includes(i.status)).length,
    ok: s.invoices.filter((i) => ['matched', 'resolved'].includes(i.status)).length,
    processing: s.invoices.filter((i) => i.status === 'processing').length,
  };
  const open = s.invoices.find((i) => i.id === openId);

  return (
    <div>
      <PageHeader eyebrow="Document & Bookkeeping · Supplier Reconciliation" title="Purchase invoices" description="Every invoice is extracted, matched with the supplier’s GST record and independently verified before it counts towards input tax credit."
        actions={<Button icon={<Upload className="size-4" />} onClick={() => setParam('upload', '1')}>Upload invoice</Button>} />

      <Card>
        <div className="flex flex-col gap-3 border-b border-beige-200 p-4 lg:flex-row lg:items-center lg:justify-between">
          <Tabs value={filter} onChange={setFilter} items={[
            { value: 'all', label: 'All', count: counts.all }, { value: 'attention', label: 'Needs attention', count: counts.attention },
            { value: 'ok', label: 'Matched', count: counts.ok }, { value: 'processing', label: 'Processing', count: counts.processing },
          ]} />
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative"><Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-300" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search number, supplier, GSTIN" className="pl-9 sm:w-64" aria-label="Search invoices" /></div>
            <Select value={supplier} onChange={(e) => setSupplier(e.target.value)} aria-label="Filter by supplier" className="sm:w-56">
              <option value="">All suppliers</option>
              {s.suppliers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </Select>
          </div>
        </div>
        {rows.length === 0 ? (
          <EmptyState icon={<FileSearch className="size-5" />} title={s.invoices.length ? 'No invoices match these filters' : 'No invoices yet'} body={s.invoices.length ? 'Try clearing the search or choosing another filter.' : 'Upload your first purchase invoice to get started.'}
            action={s.invoices.length ? <Button variant="secondary" onClick={() => { setQ(''); setSupplier(''); setFilter('all'); }}>Clear filters</Button> : <Button onClick={() => setParam('upload', '1')}>Upload invoice</Button>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="text-left text-xs text-ink-400"><tr className="border-b border-beige-200">
                <th className="px-4 py-3 font-medium">Invoice</th><th className="px-4 py-3 font-medium">Supplier</th><th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 text-right font-medium">Taxable</th><th className="px-4 py-3 text-right font-medium">GST</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 text-right font-medium">ITC at risk</th>
              </tr></thead>
              <tbody>
                {rows.map((i) => (
                  <tr key={i.id} onClick={() => setParam('open', i.id)} className="cursor-pointer border-b border-beige-200 last:border-0 hover:bg-beige-50" data-invoice={i.number}>
                    {i.status === 'processing' && i.number === 'Reading…' ? (
                      <><td className="px-4 py-3.5"><Skeleton className="w-28" /></td><td className="px-4"><Skeleton className="w-40" /></td><td className="px-4"><Skeleton className="w-20" /></td><td className="px-4"><Skeleton className="ml-auto w-16" /></td><td className="px-4"><Skeleton className="ml-auto w-14" /></td><td className="px-4"><InvoiceStatusBadge status={i.status} /></td><td /></>
                    ) : (<>
                      <td className="px-4 py-3.5 font-medium"><span className="flex items-center gap-2"><FileText className="size-4 text-ink-300" />{i.number || '—'}</span></td>
                      <td className="px-4"><div className="font-medium text-ink-700">{i.supplierName}</div><div className="font-mono text-[11px] text-ink-400">{i.supplierGstin}</div></td>
                      <td className="px-4 whitespace-nowrap text-ink-500">{fmtDate(i.date)}</td>
                      <td className="px-4 text-right tabular-nums">{inr(i.totals.taxable)}</td>
                      <td className="px-4 text-right tabular-nums">{inr(totalTax(i.totals))}</td>
                      <td className="px-4"><InvoiceStatusBadge status={i.status} /></td>
                      <td className="px-4 text-right font-medium tabular-nums">{i.reconciliation?.itcAtRisk ? <span className="text-bad">{inr(i.reconciliation.itcAtRisk)}</span> : <span className="text-ink-300">—</span>}</td>
                    </>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <UploadInvoiceModal open={uploadOpen} onClose={() => setParam('upload', null)} onStarted={(id) => setParams((prev) => { const p = new URLSearchParams(prev); p.delete('upload'); p.set('open', id); return p; }, { replace: true })} />
      {open && <InvoiceDrawer invoice={open} onClose={() => setParam('open', null)} />}
    </div>
  );
}

function InvoiceDrawer({ invoice: i, onClose }: { invoice: Invoice; onClose: () => void }) {
  const s = useAppState();
  const run = s.runs.find((r) => r.id === i.workflowRunId);
  const fu = s.followUps.find((f) => f.id === i.followUpId);
  const approval = fu && s.approvals.find((a) => a.refId === fu.id && a.status === 'pending');
  const doc = s.documents.find((d) => d.id === i.documentId);
  const processing = i.status === 'processing' && i.number === 'Reading…';
  const [editing, setEditing] = useState(false);
  const canSimulateFix = i.status === 'followup_approved' || ((i.status === 'mismatch' || i.status === 'missing_in_gst') && !run?.status.match(/running|planning|waiting/));

  return (
    <Drawer open onClose={onClose} title={processing ? 'Processing invoice…' : `Invoice ${i.number}`} subtitle={<span className="flex flex-wrap items-center gap-2">{i.supplierName}<InvoiceStatusBadge status={i.status} /></span>}
      footer={<>
        {canSimulateFix && <Button variant="secondary" icon={<RefreshCcw className="size-4" />} onClick={() => simulateSupplierCorrection(i.id)} title="Demo helper: pretend the supplier corrected their GST filing">Simulate supplier correction</Button>}
        {approval && <Link to={`/approvals?focus=${approval.id}`}><Button variant="sun">Review approval</Button></Link>}
        <Button variant="secondary" onClick={onClose}>Close</Button>
      </>}>
      <div className="space-y-6">
        {run && (
          <section className="card p-5">
            <h3 className="mb-3 text-sm font-semibold">Workflow</h3>
            <RunTimeline run={run} />
          </section>
        )}
        {processing ? (
          <section className="card space-y-3 p-5"><Skeleton className="h-5 w-40" /><Skeleton className="w-full" /><Skeleton className="w-3/4" /><Skeleton className="h-28 w-full" /></section>
        ) : i.status === 'extraction_failed' && !i.lines.length ? (
          <section className="card p-5 text-sm">
            <h3 className="font-semibold text-bad">Could not read this document</h3>
            <p className="mt-1 text-ink-500">Extraction confidence was {pct(i.extractionConfidence ?? 0)}. YUKTIDOOT does not guess financial fields. Upload a clearer copy; the unreadable file stays in Documents for review.</p>
            {doc && <p className="mt-2 font-mono text-xs text-ink-400">{doc.name}</p>}
          </section>
        ) : (<>
          <section className="card p-5">
            <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold">Extracted fields</h3>{i.extractionConfidence && <Badge tone="cobalt">Confidence {pct(i.extractionConfidence)} · simulated</Badge>}</div>
            <ExtractedFields invoice={i} />
          </section>
          <section>
            <h3 className="mb-2 text-sm font-semibold">Document preview</h3>
            <InvoicePaper invoice={i} buyerName={s.profile.businessName} />
            {doc && <p className="mt-1.5 font-mono text-[11px] text-ink-400">{doc.name} · {doc.sizeKb} KB · {doc.source === 'upload' ? 'your upload (rendered from simulated extraction)' : 'sample document'}</p>}
          </section>
          {i.reconciliation && (
            <section className="card p-5">
              <h3 className="mb-3 text-sm font-semibold">Reconciliation with supplier GST record</h3>
              <ReconTable rec={i.reconciliation} />
            </section>
          )}
          {fu && (
            <section className="card p-5">
              <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold">Supplier follow-up</h3><Badge tone={fu.status === 'approved' ? 'ok' : fu.status === 'rejected' ? 'bad' : 'sun'}>{fu.status.replace('_', ' ')} · v{fu.version}</Badge></div>
              <p className="text-xs text-ink-400">To {fu.to}</p>
              <p className="mt-1 text-sm font-medium">{fu.subject}</p>
              <pre className="mt-2 rounded-xl bg-beige-50 p-3 font-sans text-[13px] whitespace-pre-wrap text-ink-700">{fu.body}</pre>
              {fu.status !== 'approved' && fu.status !== 'rejected' && (<div className="mt-3 flex flex-wrap items-center gap-2"><Button size="sm" variant="secondary" onClick={() => setEditing(true)}>Edit message</Button>{!approval && run?.status === 'waiting_approval' && <span className="text-xs text-bad">No valid approval request: the last edit failed verification. Edit the message to continue.</span>}</div>)}
              {editing && <EditFollowUpModal id={fu.id} subject={fu.subject} body={fu.body} onClose={() => setEditing(false)} />}
              {fu.status === 'approved' && <a className="mt-3 inline-block" href={`mailto:${fu.to}?subject=${encodeURIComponent(fu.subject)}&body=${encodeURIComponent(fu.body)}`}><Button size="sm" variant="secondary">Open in email app</Button></a>}
            </section>
          )}
          {i.verification && (
            <section className="card p-5">
              <h3 className="mb-3 text-sm font-semibold">Independent verification</h3>
              <VerificationList report={i.verification} />
            </section>
          )}
        </>)}
      </div>
    </Drawer>
  );
}
