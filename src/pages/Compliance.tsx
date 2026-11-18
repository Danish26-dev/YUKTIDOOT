import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { CalendarCheck2, CalendarClock, Download, FileSpreadsheet, Landmark, PlayCircle } from 'lucide-react';
import { useAppState } from '@/store/store';
import { prepareGstr3b } from '@/store/actions';
import { Badge, Button, Card, CardHeader, PageHeader } from '@/components/ui/primitives';
import { RunTimeline } from '@/components/domain/RunTimeline';
import { gstr3bSummary } from '@/services/compliance';
import { previousPeriod } from '@/data/dates';
import { days, daysUntil, fmtDate, inr, periodLabel } from '@/lib/format';
import { cx, downloadText, toCsv } from '@/lib/util';

export function CompliancePage() {
  const s = useAppState();
  const P = previousPeriod();
  const sum = useMemo(() => gstr3bSummary(s, P), [s, P]);
  const run = s.runs.find((r) => r.template === 'gst_readiness' && r.refId === P);
  const paper = s.workingPapers.find((w) => w.id === `wp_${P}`);
  const approval = s.approvals.find((a) => a.kind === 'gst_return' && a.refId === `wp_${P}` && a.status === 'pending');
  const dl3b = s.deadlines.find((d) => d.form === 'GSTR-3B' && d.period === P);
  const deadlines = [...s.deadlines].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const busy = !!run && ['planning', 'running'].includes(run.status);

  const download = () => {
    if (!paper) return;
    const rows: (string | number)[][] = [['YUKTIDOOT working paper (demo mode, not a filing)'], ['Business', s.profile.businessName], ['GSTIN', s.profile.gstin], ['Form', paper.form], ['Period', periodLabel(paper.period)], ['Prepared', new Date(paper.createdAt).toLocaleString('en-IN')], [], ['Row', 'Amount (INR)'], ...paper.rows.map((r) => [r.label, r.value.toFixed(2)]), [], ['Purchase invoices included'], ['Invoice', 'Supplier', 'Supplier GSTIN', 'Taxable', 'GST', 'Status', 'ITC at risk'],
      ...s.invoices.filter((i) => i.reconciliation && new Date(i.date).getMonth() + 1 === Number(paper.period.slice(5)) && new Date(i.date).getFullYear() === Number(paper.period.slice(0, 4))).map((i) => [i.number, i.supplierName, i.supplierGstin, i.totals.taxable, i.totals.cgst + i.totals.sgst + i.totals.igst, i.status, i.reconciliation?.itcAtRisk ?? 0])];
    downloadText(`gstr3b-working-paper-${paper.period}.csv`, toCsv(rows), 'text/csv');
  };

  return (
    <div>
      <PageHeader eyebrow="GST & Compliance Agent" title="GST & compliance" description="Deadlines tracked and working papers prepared. Every figure comes from the rule engine. Filing stays with you; in demo mode, submission is simulated." />

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Card>
            <CardHeader title={`GSTR-3B readiness · ${periodLabel(P)}`} subtitle={dl3b ? `Due ${fmtDate(dl3b.dueDate)}${dl3b.status === 'filed' ? ` · marked submitted${dl3b.simulated ? ' (simulated)' : ''}` : ` · ${daysUntil(dl3b.dueDate) >= 0 ? `${days(daysUntil(dl3b.dueDate))} left` : 'overdue'}`}` : undefined}
              action={<Button size="sm" icon={<PlayCircle className="size-4" />} loading={busy} disabled={busy || dl3b?.status === 'filed' || run?.status === 'waiting_approval'} onClick={() => void prepareGstr3b(P)}>{paper ? 'Prepare again' : 'Prepare working paper'}</Button>} />
            <div className="grid gap-px bg-beige-200 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ['Output tax', inr(sum.outputTax), `on ${inr(sum.outwardTaxable)} sales`],
                ['Eligible ITC', inr(sum.eligibleItc), `${sum.invoiceCount} purchase invoices`],
                ['ITC held back', inr(sum.itcAtRisk), 'until suppliers correct filings'],
                ['Net payable (cash)', inr(sum.netPayable), 'simplified'],
              ].map(([k, v, sub], idx) => (
                <div key={k} className="bg-white p-5"><p className="text-xs text-ink-500">{k}</p><p className={cx('mt-1 text-xl font-semibold tabular-nums', idx === 2 && sum.itcAtRisk ? 'text-bad' : idx === 3 ? 'text-cobalt' : '')}>{v}</p><p className="text-[11px] text-ink-400">{sub}</p></div>
              ))}
            </div>
            <p className="border-t border-beige-200 px-5 py-3 text-[11px] text-ink-400">Simplified calculation: excludes reverse charge, opening credit-ledger balance, interest and late fee. Not tax advice.</p>
          </Card>

          {run && (
            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="p-5"><h3 className="mb-3 text-sm font-semibold">Preparation workflow</h3><RunTimeline run={run} /></Card>
              <Card>
                <CardHeader title="Working paper" subtitle={paper ? `Prepared ${new Date(paper.createdAt).toLocaleString('en-IN')}` : 'Not prepared yet'} action={paper && <Button size="sm" variant="secondary" icon={<Download className="size-3.5" />} onClick={download}>CSV</Button>} />
                {paper ? (<>
                  <table className="w-full text-sm"><tbody>{paper.rows.map((r) => <tr key={r.label} className="border-b border-beige-200 last:border-0"><td className="px-5 py-2.5 text-ink-500">{r.label}</td><td className="px-5 text-right font-medium tabular-nums">{inr(r.value)}</td></tr>)}</tbody></table>
                  <div className="flex items-center justify-between gap-2 border-t border-beige-200 px-5 py-3">
                    <Badge tone={paper.status === 'approved_simulated' ? 'ok' : paper.status === 'awaiting_approval' ? 'sun' : paper.status === 'rejected' ? 'bad' : 'cobalt'}>{paper.status === 'approved_simulated' ? 'Submitted (simulated)' : paper.status.replace('_', ' ')}</Badge>
                    {approval && <Link to={`/approvals?focus=${approval.id}`}><Button size="sm" variant="sun">Review approval</Button></Link>}
                  </div>
                </>) : <p className="px-5 py-8 text-center text-sm text-ink-400">The working paper appears here once prepared.</p>}
              </Card>
            </div>
          )}

          <Card>
            <CardHeader title="TDS" subtitle="Learned from job-work payments (mock books)" />
            <div className="grid gap-px bg-beige-200 sm:grid-cols-3">
              {[['Payments under Sec 194C', inr(185000), 'to 2 job-work contractors'], ['TDS deducted (1%)', inr(1850), 'individual contractors'], ['Deposit status', 'Deposited', `for ${periodLabel(P)}`]].map(([k, v, sub]) => (
                <div key={k} className="bg-white p-5"><p className="text-xs text-ink-500">{k}</p><p className="mt-1 text-lg font-semibold">{v}</p><p className="text-[11px] text-ink-400">{sub}</p></div>
              ))}
            </div>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader title="Deadlines" subtitle="Monthly filer · computed from today’s date" />
          <ol className="divide-y divide-beige-200">
            {deadlines.map((d) => {
              const left = daysUntil(d.dueDate);
              const done = d.status === 'filed';
              return (
                <li key={d.id} className="flex gap-3 px-5 py-3.5">
                  <span className={cx('grid size-10 shrink-0 place-items-center rounded-xl', done ? 'bg-ok-50 text-ok' : left < 0 ? 'bg-bad-50 text-bad' : left <= 5 ? 'bg-sun-50 text-sun-700' : 'bg-cobalt-50 text-cobalt')}>
                    {done ? <CalendarCheck2 className="size-5" /> : <CalendarClock className="size-5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold">{d.form}</span>{d.simulated && <Badge tone="sun">simulated</Badge>}</div>
                    <p className="truncate text-xs text-ink-500">{d.description} · {/^\d{4}-\d{2}$/.test(d.period) ? periodLabel(d.period) : d.period}</p>
                    <p className="mt-0.5 text-[11px] text-ink-400">Due {fmtDate(d.dueDate)}{done && d.filedOn ? ` · done ${fmtDate(d.filedOn)}` : ''}</p>
                  </div>
                  <span className={cx('self-center text-xs font-semibold whitespace-nowrap', done ? 'text-ok' : left < 0 ? 'text-bad' : left <= 5 ? 'text-sun-700' : 'text-ink-500')}>{done ? 'Done' : left < 0 ? `${-left}d overdue` : left === 0 ? 'Today' : `${left}d`}</span>
                </li>
              );
            })}
          </ol>
          <div className="flex items-center gap-2 border-t border-beige-200 px-5 py-3 text-[11px] text-ink-400"><Landmark className="size-3.5" /> No GST or TDS portal is connected in this prototype.</div>
        </Card>
      </div>
      <div className="mt-6 flex items-center gap-2 text-xs text-ink-400"><FileSpreadsheet className="size-4" /> Working papers are also listed in Documents.</div>
    </div>
  );
}
