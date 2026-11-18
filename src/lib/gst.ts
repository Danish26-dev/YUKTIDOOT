// Deterministic GST helpers. These are rule-based (no AI) by design:
// tax figures must never come from a language model.
import type { InvoiceTotals, LineItem } from '@/types';

const CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const GSTIN_SHAPE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** GSTIN check character (mod-36 algorithm used for GSTIN). */
export function gstinCheckChar(first14: string): string {
  let factor = 2;
  let sum = 0;
  for (let i = first14.length - 1; i >= 0; i--) {
    const code = CHARSET.indexOf(first14[i]);
    let digit = factor * code;
    factor = factor === 2 ? 1 : 2;
    digit = Math.floor(digit / 36) + (digit % 36);
    sum += digit;
  }
  return CHARSET[(36 - (sum % 36)) % 36];
}

export function makeGstin(first14: string) {
  return first14 + gstinCheckChar(first14);
}

export type GstinCheck = { valid: boolean; reason?: string };

export function validateGstin(raw: string): GstinCheck {
  const g = raw.trim().toUpperCase();
  if (!g) return { valid: false, reason: 'GSTIN is empty' };
  if (g.length !== 15) return { valid: false, reason: 'GSTIN must be 15 characters' };
  if (!GSTIN_SHAPE.test(g)) return { valid: false, reason: 'GSTIN format is invalid' };
  const st = Number(g.slice(0, 2));
  if (st < 1 || st > 38) return { valid: false, reason: 'Unknown state code' };
  if (gstinCheckChar(g.slice(0, 14)) !== g[14]) return { valid: false, reason: 'Checksum character does not match' };
  return { valid: true };
}

export const STATES: Record<string, string> = {
  '07': 'Delhi', '24': 'Gujarat', '27': 'Maharashtra', '29': 'Karnataka', '33': 'Tamil Nadu', '36': 'Telangana', '09': 'Uttar Pradesh', '08': 'Rajasthan',
};

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Recompute totals from line items. Intra-state supplies split CGST+SGST; inter-state use IGST. */
export function computeTotals(lines: LineItem[], supplierState: string, placeOfSupply: string): InvoiceTotals {
  const intra = supplierState === placeOfSupply;
  let taxable = 0;
  let tax = 0;
  for (const l of lines) {
    const value = r2(l.qty * l.rate);
    taxable += value;
    tax += r2((value * l.taxRate) / 100);
  }
  taxable = r2(taxable);
  tax = r2(tax);
  const half = r2(tax / 2);
  return {
    taxable,
    cgst: intra ? half : 0,
    sgst: intra ? r2(tax - half) : 0,
    igst: intra ? 0 : tax,
    total: r2(taxable + tax),
  };
}

export const totalTax = (t: InvoiceTotals) => r2(t.cgst + t.sgst + t.igst);

/** Indian registration plates, e.g. MH12AB4521, MH14T1234, DL1CAB1234. Bharat-series also accepted (22BH1234AA). */
export function validateVehicleNumber(raw: string) {
  const v = raw.replace(/[\s-]/g, '').toUpperCase();
  if (!v) return { valid: false, normalised: v, reason: 'Vehicle number is missing' };
  const regular = /^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$/;
  const bharat = /^[0-9]{2}BH[0-9]{4}[A-Z]{1,2}$/;
  if (!regular.test(v) && !bharat.test(v)) return { valid: false, normalised: v, reason: 'Vehicle number format is not recognised' };
  return { valid: true, normalised: v };
}

export const EWAY_THRESHOLD = 50000;
/** Validity for regular cargo: 1 day per 200 km or part thereof. */
export const ewayValidityDays = (km: number) => Math.max(1, Math.ceil(km / 200));
