// Verification Agent logic. Independent by construction:
// it recomputes every figure from source data (line items, GST records, rules)
// instead of trusting the totals or conclusions produced by the other agents.
import type { AppState, FollowUp, Invoice, Shipment, VerificationCheck, VerificationReport, WorkingPaper } from '@/types';
import { computeTotals, ewayValidityDays, EWAY_THRESHOLD, totalTax, validateGstin, validateVehicleNumber } from '@/lib/gst';
import { inr } from '@/lib/format';
import { findGstRecord, normaliseInvoiceNo, TOLERANCE } from './reconciliation';
import { gstr3bSummary } from './compliance';
import { nowIso } from '@/lib/util';

const close = (a: number, b: number) => Math.abs(a - b) <= TOLERANCE;

function report(subject: string, checks: VerificationCheck[]): VerificationReport {
  return { subject, checks, passed: checks.every((c) => c.passed), verifiedAt: nowIso() };
}

export function verifyInvoice(state: AppState, invoice: Invoice, followUp?: FollowUp): VerificationReport {
  const supplier = state.suppliers.find((s) => s.id === invoice.supplierId);
  const checks: VerificationCheck[] = [];

  const recomputed = computeTotals(invoice.lines, supplier?.stateCode ?? '', invoice.placeOfSupply);
  const arithmeticOk = close(recomputed.taxable, invoice.totals.taxable) && close(totalTax(recomputed), totalTax(invoice.totals)) && close(recomputed.total, invoice.totals.total);
  checks.push({ id: 'arith', label: 'Line-item arithmetic', passed: arithmeticOk,
    detail: arithmeticOk ? `Recomputed ${invoice.lines.length} lines: taxable ${inr(recomputed.taxable)}, GST ${inr(totalTax(recomputed))}.` : `Recomputed total ${inr(recomputed.total)} differs from printed total ${inr(invoice.totals.total)}.` });

  const intra = supplier?.stateCode === invoice.placeOfSupply;
  const typeOk = intra ? invoice.totals.igst === 0 && invoice.totals.cgst > 0 : invoice.totals.igst > 0 && invoice.totals.cgst === 0;
  checks.push({ id: 'taxtype', label: 'Tax type vs place of supply', passed: typeOk,
    detail: intra ? 'Intra-state supply: CGST + SGST expected and present.' : 'Inter-state supply: IGST expected and present.' });

  const g = validateGstin(invoice.supplierGstin);
  checks.push({ id: 'gstin', label: 'Supplier GSTIN format & checksum', passed: g.valid, detail: g.valid ? `${invoice.supplierGstin} is well-formed (not verified against GSTN).` : g.reason! });

  const dup = state.invoices.find((i) => i.id !== invoice.id && i.supplierGstin === invoice.supplierGstin && normaliseInvoiceNo(i.number) === normaliseInvoiceNo(invoice.number) && i.status !== 'duplicate');
  checks.push({ id: 'dup', label: 'Duplicate detection', passed: !dup, detail: dup ? `Already recorded as ${dup.id}.` : 'No other invoice with this number from this supplier.' });

  if (invoice.reconciliation) {
    const rec = findGstRecord(invoice, state.gstRecords);
    const expectedRisk = rec ? Math.max(0, totalTax(recomputed) - rec.taxAmount) : totalTax(recomputed);
    const expectedOutcome = !rec ? 'missing_in_gst' : close(rec.taxableValue, recomputed.taxable) && close(rec.taxAmount, totalTax(recomputed)) ? 'matched' : 'value_mismatch';
    const ok = expectedOutcome === invoice.reconciliation.outcome && close(expectedRisk, invoice.reconciliation.itcAtRisk);
    checks.push({ id: 'recon', label: 'Reconciliation re-check', passed: ok,
      detail: ok ? `Re-queried GST records independently: ${expectedOutcome.replace(/_/g, ' ')}, ITC at risk ${inr(expectedRisk)}.` : `Independent result (${expectedOutcome}, ${inr(expectedRisk)}) disagrees with the reconciliation agent.` });

    if (followUp) {
      const amtOk = close(followUp.amountInQuestion, expectedRisk);
      const refOk = followUp.body.includes(invoice.number) && followUp.subject.includes(invoice.number);
      const toOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(followUp.to);
      checks.push({ id: 'fu_amt', label: 'Follow-up amount', passed: amtOk, detail: amtOk ? `Quotes ${inr(followUp.amountInQuestion)}, matching the recomputed difference.` : `Draft quotes ${inr(followUp.amountInQuestion)} but the recomputed difference is ${inr(expectedRisk)}.` });
      checks.push({ id: 'fu_ref', label: 'Follow-up references the invoice', passed: refOk, detail: refOk ? `Subject and body cite ${invoice.number}.` : 'Draft must cite the invoice number in subject and body.' });
      checks.push({ id: 'fu_to', label: 'Recipient address', passed: toOk, detail: toOk ? `Addressed to ${followUp.to}.` : 'Recipient email is not valid.' });
    }
  }
  return report(`Invoice ${invoice.number}`, checks);
}

export function verifyShipment(s: Shipment): VerificationReport {
  const checks: VerificationCheck[] = [];
  const required = s.value > EWAY_THRESHOLD;
  checks.push({ id: 'threshold', label: 'E-way bill applicability', passed: required === (s.validation?.ewayRequired ?? required), detail: `Value ${inr(s.value)} ${required ? 'exceeds' : 'does not exceed'} ${inr(EWAY_THRESHOLD)}.` });
  const v = validateVehicleNumber(s.vehicleNumber);
  checks.push({ id: 'vehicle', label: 'Vehicle number (Part-B)', passed: !required || v.valid, detail: v.valid ? `${v.normalised} is a valid registration format.` : v.reason! });
  const g = validateGstin(s.consigneeGstin);
  checks.push({ id: 'gstin', label: 'Consignee GSTIN', passed: g.valid, detail: g.valid ? 'Well-formed, checksum valid.' : g.reason! });
  const days = ewayValidityDays(s.distanceKm);
  checks.push({ id: 'validity', label: 'Validity period', passed: days === (s.validation?.validityDays ?? days), detail: `${s.distanceKm} km → ${days} day(s) validity for regular cargo.` });
  return report(`Shipment ${s.id}`, checks);
}

export function verifyWorkingPaper(state: AppState, paper: WorkingPaper): VerificationReport {
  const s = gstr3bSummary(state, paper.period);
  const expect: Record<string, number> = { 'Output tax': s.outputTax, 'Eligible ITC (matched)': s.eligibleItc, 'ITC at risk (held back)': s.itcAtRisk, 'Net tax payable (cash)': s.netPayable };
  const checks: VerificationCheck[] = paper.rows.filter((r) => r.label in expect).map((r) => ({
    id: r.label, label: r.label, passed: close(r.value, expect[r.label]),
    detail: close(r.value, expect[r.label]) ? `Recomputed from ${s.invoiceCount} invoices: ${inr(expect[r.label])}.` : `Paper shows ${inr(r.value)}, recomputed ${inr(expect[r.label])}.`,
  }));
  checks.push({ id: 'pending', label: 'No invoices still processing', passed: s.pendingReview === 0, detail: s.pendingReview ? `${s.pendingReview} invoice(s) still processing for this period.` : 'All invoices for the period are processed.' });
  return report(`GSTR-3B working paper ${paper.period}`, checks);
}
