// Document intake: upload validation, classification and (simulated) field extraction.
// Real extraction would run OCR + a model behind the private inference layer.
// Here, each upload maps deterministically to one of the sample invoices.
import type { DocumentType, InvoiceTotals, LineItem, Supplier } from '@/types';
import { GENERIC_SAMPLE, SAMPLE_INVOICES, sampleDate, type SampleInvoice } from '@/data/samples';
import { OWN_GSTIN } from '@/data/parties';
import { computeTotals } from '@/lib/gst';

export const ACCEPTED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
export const ACCEPT_ATTR = '.pdf,.jpg,.jpeg,.png,.webp';
export const MAX_UPLOAD_MB = 10;

export function validateUpload(file: { name: string; type: string; size: number }): string | null {
  const ext = file.name.toLowerCase().split('.').pop() ?? '';
  const okType = ACCEPTED_TYPES.includes(file.type) || ['pdf', 'jpg', 'jpeg', 'png', 'webp'].includes(ext);
  if (!okType) return `“${file.name}” is not a supported file. Upload a PDF, JPG, PNG or WEBP.`;
  if (file.size === 0) return `“${file.name}” is empty.`;
  if (file.size > MAX_UPLOAD_MB * 1024 * 1024) return `“${file.name}” is larger than ${MAX_UPLOAD_MB} MB.`;
  return null;
}

export function classifyDocument(name: string, mime: string): DocumentType {
  const n = name.toLowerCase();
  if (/(invoice|inv[-_ ]|bill|tax|steel|packag|lubric|kaveri|patel|ganesh|ajanta|blurry)/.test(n)) return 'purchase_invoice';
  if (/receipt|rcpt|cash/.test(n)) return 'receipt';
  if (/(shop|workshop|factory|unit|premises|machine|store)/.test(n) || (mime.startsWith('image/') && /img|photo|dsc|pxl/.test(n))) return 'business_photo';
  return 'other';
}

/** Pick the sample this upload stands for: filename keywords first, otherwise the next unused sample. */
export function pickSample(fileName: string, usedKeys: Set<string>): SampleInvoice {
  const n = fileName.toLowerCase();
  const byName = SAMPLE_INVOICES.find((s) =>
    (s.key === 'ganesh_mismatch' && /ganesh|steel/.test(n)) ||
    (s.key === 'patel_matched' && /patel|packag/.test(n)) ||
    (s.key === 'kaveri_missing' && /kaveri|lubric/.test(n)) ||
    (s.key === 'blurry_photo' && /blur|unreadable|corrupt/.test(n)));
  if (byName) return byName;
  return SAMPLE_INVOICES.find((s) => s.key !== 'blurry_photo' && !usedKeys.has(s.key)) ?? GENERIC_SAMPLE;
}

export interface Extraction {
  sampleKey: SampleInvoice['key'];
  confidence: number;
  number: string;
  supplierId: string;
  supplierName: string;
  supplierGstin: string;
  date: string;
  placeOfSupply: string;
  buyerGstin: string;
  lines: LineItem[];
  totals: InvoiceTotals;
}

export function extract(sample: SampleInvoice, suppliers: Supplier[], genericSeq: number): Extraction {
  const sup = suppliers.find((s) => s.id === sample.supplierId)!;
  const number = sample.key === 'ajanta_generic' ? `${sample.number}${String(400 + genericSeq).padStart(4, '0')}` : sample.number;
  return {
    sampleKey: sample.key,
    confidence: sample.confidence,
    number,
    supplierId: sup.id,
    supplierName: sup.name,
    supplierGstin: sup.gstin,
    date: sampleDate(sample),
    placeOfSupply: '27',
    buyerGstin: OWN_GSTIN,
    lines: sample.lines,
    totals: computeTotals(sample.lines, sup.stateCode, '27'),
  };
}
