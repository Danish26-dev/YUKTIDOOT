// Supplier reconciliation rule engine (deterministic).
// Compares the books (extracted invoice) with the supplier-filed GST record.
import type { GstRecord, Invoice, ReconciliationResult } from '@/types';
import { totalTax } from '@/lib/gst';
import { inr } from '@/lib/format';

export const TOLERANCE = 1; // rupees: rounding differences up to ₹1 are treated as a match

export const normaliseInvoiceNo = (n: string) => n.toUpperCase().replace(/[\s\-/_.]/g, '');

export function findGstRecord(invoice: Pick<Invoice, 'supplierGstin' | 'number'>, records: GstRecord[]) {
  const key = normaliseInvoiceNo(invoice.number);
  return records.find((r) => r.supplierGstin === invoice.supplierGstin && normaliseInvoiceNo(r.invoiceNumber) === key);
}

export function reconcile(invoice: Invoice, records: GstRecord[], now = new Date().toISOString()): ReconciliationResult {
  const record = findGstRecord(invoice, records);
  const booksTax = totalTax(invoice.totals);
  if (!record) {
    return {
      outcome: 'missing_in_gst',
      differences: [{ field: 'Tax amount', books: booksTax, gst: 0, diff: booksTax }],
      itcAtRisk: booksTax,
      checkedAt: now,
      explanation: `No matching record from this supplier in the GST data for this period. Input tax credit of ${inr(booksTax)} cannot be claimed until the supplier files it.`,
    };
  }
  const differences = [
    { field: 'Taxable value', books: invoice.totals.taxable, gst: record.taxableValue, diff: invoice.totals.taxable - record.taxableValue },
    { field: 'Tax amount', books: booksTax, gst: record.taxAmount, diff: booksTax - record.taxAmount },
  ].filter((d) => Math.abs(d.diff) > TOLERANCE);

  if (differences.length === 0) {
    return { outcome: 'matched', gstRecordId: record.id, differences: [], itcAtRisk: 0, checkedAt: now, explanation: 'Taxable value and tax match the supplier’s filed record within ₹1.' };
  }
  const taxDiff = Math.max(0, booksTax - record.taxAmount);
  return {
    outcome: 'value_mismatch',
    gstRecordId: record.id,
    differences,
    itcAtRisk: taxDiff,
    checkedAt: now,
    explanation: `The supplier reported ${inr(record.taxableValue)} taxable value against ${inr(invoice.totals.taxable)} on the invoice. ${inr(taxDiff)} of input tax credit is at risk.`,
  };
}
