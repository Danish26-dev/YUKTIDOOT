import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Mail, RefreshCcw, Scale } from 'lucide-react';
import { useAppState } from '@/store/store';
import { rerunReconciliation } from '@/store/actions';
import { Badge, Button, Card, CardHeader, EmptyState, PageHeader, Select, StatCard, Tabs } from '@/components/ui/primitives';
import { InvoiceStatusBadge } from '@/components/domain/status';
import { findGstRecord } from '@/services/reconciliation';
import { periodOfIso } from '@/services/compliance';
import { monthsAgo, periodOf } from '@/data/dates';
import { inr, periodLabel, relTime } from '@/lib/format';
import { totalTax } from '@/lib/gst';
import { cx } from '@/lib/util';

type View = 'all' | 'issues' | 'matched';

export function ReconciliationPage() {
  const s = useAppState();
  const periods = [periodOf(monthsAgo(1)), periodOf(monthsAgo(2))];
  const [period, setPeriod] = useState(periods[0]);
  const [view, setView] = useState<View>('all');

  const rows = useMemo(() => s.invoices
    .filter((i) => periodOfIso(i.date) === period && i.reconciliation)
    .map((i) => ({ i, rec: findGstRecord(i, s.gstRecords) })), [s.invoices, s.gstRecords, period]);
  const issues = rows.filter(({ i }) => i.reconciliation!.outcome !== 'matched');
  const shown = view === 'all' ? rows : view === 'issues' ? issues : rows.filter(({ i }) => i.reconciliation!.outcome === 'matched');
  const atRisk = issues.reduce((a, { i }) => a + i.reconciliation!.itcAtRisk, 0);
  const eligible = rows.reduce((a, { i }) => a + totalTax(i.totals) - i.reconciliation!.itcAtRisk, 0);

  const bySupplier = useMemo(() => s.suppliers.map((sup) => {
    const mine = rows.filter(({ i }) => i.supplierId === sup.id);
    return { sup, count: mine.length, risk: mine.reduce((a, { i }) => a + i.reconciliation!.itcAtRisk, 0), issues: mine.filter(({ i }) => i.reconciliation!.outcome !== 'matched').length };
  }).filter((x) => x.count > 0).sort((a, b) => b.risk - a.risk), [s.suppliers, rows]);

  const followUps = s.followUps.filter((f) => { const inv = s.invoices.find((i) => i.id === f.invoiceId); return inv && periodOfIso(inv.date) === period; });

  return (
    <div>
      <PageHeader eyebrow="Supplier Reconciliation Agent" title="Supplier reconciliation" description="Your purchase invoices compared with what suppliers filed. Supplier records here are simulated in the shape of GSTR-2B. No GST portal is connected."
        actions={<>
          <Select value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Tax period" className="w-48">{periods.map((p) => <option key={p} value={p}>{periodLabel(p)}</option>)}</Select>
          <Button variant="secondary" icon={<RefreshCcw className="size-4" />} onClick={() => rerunReconciliation(period)}>Re-run</Button>
        </>} />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Invoices reconciled" value={rows.length} sub={periodLabel(period)} />
        <StatCard label="Matched" value={rows.length - issues.length} sub="Within ₹1 tolerance" tone="cobalt" />
        <StatCard label="Discrepancies" value={issues.length} sub="Mismatch or not filed" tone={issues.length ? 'bad' : 'neutral'} />
        <StatCard label="ITC at risk" value={inr(atRisk)} sub={`Eligible ${inr(eligible)}`} tone={atRisk ? 'bad' : 'neutral'} />
      </div>

      <div className="grid gap-6 2xl:grid-cols-[1fr_340px]">
        <Card>
          <div className="flex flex-col gap-3 border-b border-beige-200 p-4 sm:flex-row sm:items-center sm:justify-between">
            <Tabs value={view} onChange={setView} items={[{ value: 'all', label: 'All', count: rows.length }, { value: 'issues', label: 'Discrepancies', count: issues.length }, { value: 'matched', label: 'Matched', count: rows.length - issues.length }]} />
            <span className="text-xs text-ink-400">Books = your invoice copy · Filed = supplier’s GST record</span>
          </div>
          {shown.length === 0 ? <EmptyState icon={<Scale className="size-5" />} title="Nothing to show" body={rows.length ? 'No invoices in this view.' : 'No reconciled invoices for this period yet. Upload a purchase invoice to start.'} action={!rows.length ? <Link to="/invoices?upload=1"><Button>Upload invoice</Button></Link> : undefined} /> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead className="text-left text-xs text-ink-400"><tr className="border-b border-beige-200">
                  <th className="px-4 py-3 font-medium">Invoice</th><th className="px-4 py-3 text-right font-medium">Books taxable</th><th className="px-4 py-3 text-right font-medium">Filed taxable</th>
                  <th className="px-4 py-3 text-right font-medium">Books GST</th><th className="px-4 py-3 text-right font-medium">Filed GST</th><th className="px-4 py-3 text-right font-medium">ITC at risk</th><th className="px-4 py-3 font-medium">Status</th><th />
                </tr></thead>
                <tbody>
                  {shown.map(({ i, rec }) => {
                    const bad = i.reconciliation!.outcome !== 'matched';
                    return (
                      <tr key={i.id} className={cx('border-b border-beige-200 last:border-0', bad && 'bg-bad-50/40')}>
                        <td className="px-4 py-3"><div className="font-medium">{i.number}</div><div className="text-xs text-ink-500">{i.supplierName}</div></td>
                        <td className="px-4 text-right tabular-nums">{inr(i.totals.taxable)}</td>
                        <td className={cx('px-4 text-right tabular-nums', rec && rec.taxableValue !== i.totals.taxable && 'font-semibold text-bad')}>{rec ? inr(rec.taxableValue) : <Badge tone="bad">Not filed</Badge>}</td>
                        <td className="px-4 text-right tabular-nums">{inr(totalTax(i.totals))}</td>
                        <td className={cx('px-4 text-right tabular-nums', rec && Math.abs(rec.taxAmount - totalTax(i.totals)) > 1 && 'font-semibold text-bad')}>{rec ? inr(rec.taxAmount) : '—'}</td>
                        <td className="px-4 text-right font-semibold tabular-nums">{i.reconciliation!.itcAtRisk ? <span className="text-bad">{inr(i.reconciliation!.itcAtRisk)}</span> : <span className="text-ink-300">—</span>}</td>
                        <td className="px-4"><InvoiceStatusBadge status={i.status} /></td>
                        <td className="px-4"><Link to={`/invoices?open=${i.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-cobalt hover:underline">Open <ArrowUpRight className="size-3" /></Link></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="grid gap-6 lg:grid-cols-2 2xl:grid-cols-1 2xl:content-start">
          <Card>
            <CardHeader title="By supplier" subtitle="Sorted by ITC at risk" />
            <ul className="divide-y divide-beige-200">
              {bySupplier.map(({ sup, count, risk, issues: n }) => (
                <li key={sup.id} className="px-5 py-3">
                  <div className="flex items-center justify-between gap-2"><span className="truncate text-sm font-medium">{sup.name}</span><span className={cx('text-sm font-semibold tabular-nums', risk ? 'text-bad' : 'text-ok')}>{risk ? inr(risk) : 'Clear'}</span></div>
                  <p className="text-xs text-ink-400">{count} invoice(s){n ? ` · ${n} discrepancy` : ''} · {sup.category}</p>
                </li>
              ))}
              {!bySupplier.length && <li className="px-5 py-6 text-center text-sm text-ink-400">No suppliers for this period.</li>}
            </ul>
          </Card>
          <Card>
            <CardHeader title="Supplier follow-ups" subtitle="Drafted by the Reconciliation Agent" />
            <ul className="divide-y divide-beige-200">
              {followUps.map((f) => {
                const sup = s.suppliers.find((x) => x.id === f.supplierId);
                const apr = s.approvals.find((a) => a.refId === f.id && a.status === 'pending');
                return (
                  <li key={f.id} className="px-5 py-3">
                    <div className="flex items-center gap-2"><Mail className="size-4 text-ink-300" /><span className="flex-1 truncate text-sm font-medium">{sup?.name}</span><Badge tone={f.status === 'approved' ? 'ok' : f.status === 'rejected' ? 'bad' : 'sun'}>{f.status.replace('_', ' ')}</Badge></div>
                    <p className="mt-0.5 truncate text-xs text-ink-500">{f.subject}</p>
                    <div className="mt-1 flex items-center justify-between text-[11px] text-ink-400"><span>v{f.version} · {relTime(f.createdAt)}</span>{apr && <Link to={`/approvals?focus=${apr.id}`} className="font-medium text-cobalt hover:underline">Review</Link>}</div>
                  </li>
                );
              })}
              {!followUps.length && <li className="px-5 py-6 text-center text-sm text-ink-400">No follow-ups needed yet.</li>}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
