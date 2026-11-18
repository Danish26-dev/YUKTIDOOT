import { CheckCircle2, XCircle } from 'lucide-react';
import type { Invoice, ReconciliationResult, VerificationReport } from '@/types';
import { inr, inr2, fmtDate, fmtDateTime, num } from '@/lib/format';
import { STATES, totalTax } from '@/lib/gst';
import { OWN_GSTIN } from '@/data/parties';
import { cx } from '@/lib/util';
import { Mono } from '@/components/ui/primitives';

/** Renders the invoice as the document would look. Used as a stand-in preview for sample uploads. */
export function InvoicePaper({ invoice, buyerName }: { invoice: Invoice; buyerName: string }) {
  const intra = invoice.totals.igst === 0;
  return (
    <div className="rounded-xl border border-beige-300 bg-[#fffdf8] p-5 font-mono text-[11.5px] leading-relaxed text-ink-700 shadow-inner">
      <div className="flex flex-wrap justify-between gap-3 border-b border-dashed border-beige-300 pb-3">
        <div>
          <div className="font-sans text-sm font-bold text-ink">{invoice.supplierName}</div>
          <div>GSTIN {invoice.supplierGstin}</div>
        </div>
        <div className="text-right">
          <div className="font-sans text-xs font-semibold tracking-widest text-ink">TAX INVOICE</div>
          <div>No. {invoice.number}</div>
          <div>Date {fmtDate(invoice.date)}</div>
        </div>
      </div>
      <div className="border-b border-dashed border-beige-300 py-2">
        Bill to: {buyerName} · GSTIN {OWN_GSTIN} · Place of supply {invoice.placeOfSupply} ({STATES[invoice.placeOfSupply] ?? '—'})
      </div>
      <div className="overflow-x-auto">
        <table className="mt-2 w-full min-w-[460px]">
          <thead><tr className="text-left text-ink-400"><th className="py-1 font-normal">Description</th><th className="font-normal">HSN</th><th className="text-right font-normal">Qty</th><th className="text-right font-normal">Rate</th><th className="text-right font-normal">Amount</th></tr></thead>
          <tbody>
            {invoice.lines.map((l, i) => (
              <tr key={i} className="border-t border-beige-200"><td className="py-1 pr-2">{l.description}</td><td>{l.hsn}</td><td className="text-right">{num(l.qty)} {l.unit}</td><td className="text-right">{num(l.rate)}</td><td className="text-right">{num(l.qty * l.rate)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 ml-auto w-full max-w-60 space-y-0.5 border-t border-dashed border-beige-300 pt-2">
        <Row k="Taxable value" v={inr2(invoice.totals.taxable)} />
        {intra ? <><Row k="CGST 9%" v={inr2(invoice.totals.cgst)} /><Row k="SGST 9%" v={inr2(invoice.totals.sgst)} /></> : <Row k="IGST 18%" v={inr2(invoice.totals.igst)} />}
        <Row k="Total" v={inr2(invoice.totals.total)} strong />
      </div>
    </div>
  );
}
const Row = ({ k, v, strong }: { k: string; v: string; strong?: boolean }) => (
  <div className={cx('flex justify-between', strong && 'font-bold text-ink')}><span>{k}</span><span>{v}</span></div>
);

export function ExtractedFields({ invoice }: { invoice: Invoice }) {
  const items: [string, string][] = [
    ['Invoice number', invoice.number], ['Invoice date', fmtDate(invoice.date)], ['Supplier', invoice.supplierName], ['Supplier GSTIN', invoice.supplierGstin],
    ['Place of supply', `${invoice.placeOfSupply} · ${STATES[invoice.placeOfSupply] ?? ''}`], ['Taxable value', inr2(invoice.totals.taxable)],
    ['GST', `${inr2(totalTax(invoice.totals))} (${invoice.totals.igst ? 'IGST' : 'CGST + SGST'})`], ['Invoice total', inr2(invoice.totals.total)],
  ];
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map(([k, v]) => (
        <div key={k}><dt className="text-[11px] text-ink-400">{k}</dt><dd className="mt-0.5 text-sm font-medium break-all text-ink">{v}</dd></div>
      ))}
    </dl>
  );
}

export function ReconTable({ rec }: { rec: ReconciliationResult }) {
  if (rec.outcome === 'matched') return <p className="text-sm text-ok">{rec.explanation}</p>;
  return (
    <div>
      <div className="overflow-x-auto rounded-xl border border-beige-200">
        <table className="w-full min-w-[420px] text-sm">
          <thead className="bg-beige-50 text-left text-xs text-ink-500"><tr><th className="px-3 py-2 font-medium">Field</th><th className="px-3 py-2 text-right font-medium">Your books</th><th className="px-3 py-2 text-right font-medium">Supplier filing</th><th className="px-3 py-2 text-right font-medium">Difference</th></tr></thead>
          <tbody>
            {rec.differences.map((d) => (
              <tr key={d.field} className="border-t border-beige-200"><td className="px-3 py-2">{d.field}</td><td className="px-3 py-2 text-right tabular-nums">{inr(d.books)}</td><td className="px-3 py-2 text-right tabular-nums">{rec.outcome === 'missing_in_gst' ? 'Not filed' : inr(d.gst)}</td><td className="px-3 py-2 text-right font-semibold text-bad tabular-nums">{inr(d.diff)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-sm text-ink-500">{rec.explanation}</p>
    </div>
  );
}

export function VerificationList({ report }: { report: VerificationReport }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-xs text-ink-500">
        <span className={report.passed ? 'font-medium text-ok' : 'font-medium text-bad'}>{report.passed ? 'All checks passed' : 'Verification failed'}</span>
        <Mono>{fmtDateTime(report.verifiedAt)}</Mono>
      </div>
      <ul className="space-y-2">
        {report.checks.map((c) => (
          <li key={c.id} className="flex gap-2.5 rounded-xl bg-beige-50 px-3 py-2">
            {c.passed ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-bad" />}
            <div className="min-w-0"><p className="text-[13px] font-medium text-ink">{c.label}</p><p className="text-xs break-words text-ink-500">{c.detail}</p></div>
          </li>
        ))}
      </ul>
    </div>
  );
}
