// Canonical approval payloads. The approval hash is computed over exactly these fields,
// so any change to the underlying object invalidates an earlier approval.
import type { Approval, AppState } from '@/types';
import { followUpPayload } from './followup';

export function shipmentPayload(state: AppState, id: string) {
  const s = state.shipments.find((x) => x.id === id);
  if (!s) return undefined;
  return {
    shipmentId: s.id, invoiceNumber: s.invoiceNumber, consignee: s.consignee, consigneeGstin: s.consigneeGstin,
    toPin: s.toPin, value: s.value, hsn: s.hsn, vehicleNumber: s.vehicleNumber.replace(/[\s-]/g, '').toUpperCase(),
    distanceKm: s.distanceKm, validityDays: s.validation?.validityDays ?? 0,
  };
}

export function paperPayload(state: AppState, id: string) {
  const p = state.workingPapers.find((x) => x.id === id);
  if (!p) return undefined;
  const out: Record<string, string | number> = { paperId: p.id, form: p.form, period: p.period };
  p.rows.forEach((r) => { out[r.label] = r.value; });
  return out;
}

export function followUpPayloadFor(state: AppState, id: string) {
  const f = state.followUps.find((x) => x.id === id);
  if (!f) return undefined;
  const inv = state.invoices.find((i) => i.id === f.invoiceId);
  return followUpPayload(f, inv?.number ?? '', inv?.supplierGstin ?? '');
}

/** Recompute the payload an approval refers to, from current state. */
export function currentPayload(state: AppState, a: Pick<Approval, 'kind' | 'refId'>): Record<string, string | number> | undefined {
  switch (a.kind) {
    case 'supplier_followup': return followUpPayloadFor(state, a.refId);
    case 'eway_bill': return shipmentPayload(state, a.refId);
    case 'gst_return': return paperPayload(state, a.refId);
  }
}
