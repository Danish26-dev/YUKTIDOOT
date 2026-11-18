// Sample purchase invoices used by the extraction simulator.
// In a real deployment these fields would come from OCR + model extraction (via the private inference layer).
import type { LineItem } from '@/types';
import { dayIn } from './dates';

export interface SampleInvoice {
  key: 'ganesh_mismatch' | 'patel_matched' | 'kaveri_missing' | 'blurry_photo' | 'ajanta_generic';
  label: string;
  hint: string;
  fileName: string;
  supplierId: string;
  number: string;
  dayOfPrevMonth: number;
  lines: LineItem[];
  /** Simulated extraction confidence. Below 0.6 the extractor refuses to continue. */
  confidence: number;
}

export const SAMPLE_INVOICES: SampleInvoice[] = [
  {
    key: 'ganesh_mismatch', label: 'Shree Ganesh Steel · tax invoice', hint: 'Supplier reported a lower value in GST records',
    fileName: 'ganesh-steel-invoice-1187.pdf', supplierId: 'sup_ganesh', number: 'SGST/2026/1187', dayOfPrevMonth: 14, confidence: 0.96,
    lines: [
      { description: 'MS round bar 20 mm (IS 2062)', hsn: '7214', qty: 850, unit: 'kg', rate: 62, taxRate: 18 },
      { description: 'MS flat 40 × 6 mm', hsn: '7211', qty: 400, unit: 'kg', rate: 64, taxRate: 18 },
      { description: 'Bright bar EN8 25 mm', hsn: '7215', qty: 300, unit: 'kg', rate: 78, taxRate: 18 },
    ],
  },
  {
    key: 'patel_matched', label: 'Patel Packaging · tax invoice', hint: 'Matches the supplier’s GST record',
    fileName: 'patel-packaging-0442.pdf', supplierId: 'sup_patel', number: 'PPI/26-27/0442', dayOfPrevMonth: 16, confidence: 0.94,
    lines: [
      { description: '5-ply corrugated box 450×300×300', hsn: '4819', qty: 1200, unit: 'pcs', rate: 38, taxRate: 18 },
      { description: 'Corrugated separator sheet', hsn: '4819', qty: 500, unit: 'pcs', rate: 6, taxRate: 18 },
    ],
  },
  {
    key: 'kaveri_missing', label: 'Kaveri Lubricants · tax invoice', hint: 'Supplier has not filed this invoice yet',
    fileName: 'kaveri-lubricants-0093.jpg', supplierId: 'sup_kaveri', number: 'KL/2627/0093', dayOfPrevMonth: 18, confidence: 0.91,
    lines: [{ description: 'Soluble cutting oil (210 L drum)', hsn: '2710', qty: 210, unit: 'L', rate: 245, taxRate: 18 }],
  },
  {
    key: 'blurry_photo', label: 'Blurry phone photo', hint: 'Unreadable image: extraction fails safely',
    fileName: 'blurry-whatsapp-photo.jpg', supplierId: 'sup_ajanta', number: '', dayOfPrevMonth: 20, confidence: 0.41,
    lines: [],
  },
];

/** Used when an uploaded file does not match any named sample and all samples are already used. */
export const GENERIC_SAMPLE: SampleInvoice = {
  key: 'ajanta_generic', label: 'Ajanta Electricals · tax invoice', hint: 'Generic invoice for extra uploads',
  fileName: 'invoice.pdf', supplierId: 'sup_ajanta', number: 'AE/26-27/', dayOfPrevMonth: 22, confidence: 0.88,
  lines: [
    { description: 'MCB 32 A double pole', hsn: '8536', qty: 10, unit: 'pcs', rate: 640, taxRate: 18 },
    { description: 'FR copper cable 2.5 sq mm', hsn: '8544', qty: 90, unit: 'm', rate: 44, taxRate: 18 },
  ],
};

export const sampleDate = (s: SampleInvoice) => dayIn(1, s.dayOfPrevMonth);

/** Simulated supplier-filed GST values for the sample invoices. Kaveri is intentionally absent. */
export const SAMPLE_GST_RECORDS: Record<string, { taxable: number; tax: number } | undefined> = {
  ganesh_mismatch: { taxable: 78300, tax: 14094 }, // supplier omitted the EN8 bright-bar line (₹23,400)
  patel_matched: { taxable: 48600, tax: 8748 },
  kaveri_missing: undefined,
};
