// GSTR-3B working-paper figures (deterministic, simplified).
// Excludes reverse charge, credit-ledger balances, interest and late fees.
import type { AppState, Invoice } from '@/types';
import { totalTax } from '@/lib/gst';

export const inPeriod = (inv: Invoice, period: string) => periodOfIso(inv.date) === period;

function periodOfIso(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export interface Gstr3bSummary {
  period: string;
  invoiceCount: number;
  outwardTaxable: number;
  outputTax: number;
  eligibleItc: number;
  itcAtRisk: number;
  netPayable: number;
  pendingReview: number;
}

export function gstr3bSummary(state: Pick<AppState, 'invoices' | 'monthly'>, period: string): Gstr3bSummary {
  const invs = state.invoices.filter((i) => periodOfIso(i.date) === period && i.status !== 'duplicate' && i.status !== 'extraction_failed' && i.status !== 'processing');
  const eligible = invs.filter((i) => i.status === 'matched' || i.status === 'resolved');
  const atRisk = invs.filter((i) => ['mismatch', 'missing_in_gst', 'followup_pending', 'followup_approved'].includes(i.status));
  const eligibleItc = round(eligible.reduce((s, i) => s + totalTax(i.totals), 0) + atRisk.reduce((s, i) => s + (totalTax(i.totals) - (i.reconciliation?.itcAtRisk ?? 0)), 0));
  const itcAtRisk = round(atRisk.reduce((s, i) => s + (i.reconciliation?.itcAtRisk ?? 0), 0));
  const m = state.monthly.find((x) => x.period === period);
  const outputTax = m?.outputTax ?? 0;
  return {
    period,
    invoiceCount: invs.length,
    outwardTaxable: m?.outwardTaxable ?? 0,
    outputTax,
    eligibleItc,
    itcAtRisk,
    netPayable: Math.max(0, round(outputTax - eligibleItc)),
    pendingReview: state.invoices.filter((i) => periodOfIso(i.date) === period && i.status === 'processing').length,
  };
}

const round = (v: number) => Math.round(v * 100) / 100;
export { periodOfIso };
