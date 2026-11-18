import type { BusinessProfile, FollowUp, Invoice, Supplier } from '@/types';
import { inr, fmtDate, periodLabel } from '@/lib/format';
import { uid, nowIso } from '@/lib/util';

/** Template-based draft. A real deployment could have the private inference layer polish the wording;
 *  the numbers would still come from the rule engine, never from the model. */
export function draftFollowUp(invoice: Invoice, supplier: Supplier, profile: BusinessProfile, period: string): FollowUp {
  const rec = invoice.reconciliation!;
  const missing = rec.outcome === 'missing_in_gst';
  const subject = missing
    ? `Invoice ${invoice.number} not reflected in GST records (${periodLabel(period)})`
    : `Value mismatch on invoice ${invoice.number} in your GST filing`;
  const lines = missing
    ? [
        `Your invoice ${invoice.number} dated ${fmtDate(invoice.date)} (taxable value ${inr(invoice.totals.taxable)}, GST ${inr(rec.itcAtRisk)}) does not appear in the GST data available to us for ${periodLabel(period)}.`,
        `Please report it in your GSTR-1 at the earliest so that we can claim the input tax credit.`,
      ]
    : [
        `For invoice ${invoice.number} dated ${fmtDate(invoice.date)}, the taxable value on our copy is ${inr(invoice.totals.taxable)}, but the value reported in your GST filing is ${inr(rec.differences.find((d) => d.field === 'Taxable value')?.gst ?? 0)}.`,
        `This leaves ${inr(rec.itcAtRisk)} of input tax credit unmatched. Please check and amend the entry in your next GSTR-1.`,
      ];
  const body = [
    `Dear ${supplier.name} team,`,
    '',
    ...lines,
    '',
    `Our GSTIN: ${profile.gstin}`,
    `Your GSTIN: ${supplier.gstin}`,
    '',
    'Thank you,',
    `${profile.ownerName}`,
    `${profile.businessName}`,
  ].join('\n');
  return {
    id: uid('fu'),
    invoiceId: invoice.id,
    supplierId: supplier.id,
    to: supplier.email,
    subject,
    body,
    amountInQuestion: rec.itcAtRisk,
    status: 'draft',
    version: 1,
    createdAt: nowIso(),
  };
}

export const followUpPayload = (f: FollowUp, invoiceNumber: string, supplierGstin: string) => ({
  followUpId: f.id,
  version: f.version,
  invoiceNumber,
  supplierGstin,
  to: f.to,
  subject: f.subject,
  body: f.body,
  amountInQuestion: f.amountInQuestion,
});
