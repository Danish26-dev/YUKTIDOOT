// Approved tool registry. Workflow nodes may only reference handlers listed here.
// Each handler is a small, deterministic step; AI-shaped steps (extraction) are simulated.
import type { AppState } from '@/types';
import { store, log } from '@/store/store';
import { toast } from '@/store/toast';
import { nowIso } from '@/lib/util';
import { inr, pct, fmtDate, periodLabel } from '@/lib/format';
import { totalTax } from '@/lib/gst';
import type { Extraction } from '@/services/extraction';
import { findGstRecord, normaliseInvoiceNo, reconcile } from '@/services/reconciliation';
import { draftFollowUp } from '@/services/followup';
import { verifyInvoice, verifyShipment, verifyWorkingPaper } from '@/services/verification';
import { validateShipment } from '@/services/dispatch';
import { gstr3bSummary } from '@/services/compliance';
import { requestApproval } from './approvals';

export interface NodeResult {
  detail?: string;
  branch?: string;
  awaitApproval?: boolean;
  stop?: string;
  fail?: string;
}
export type Handler = (ctx: { runId: string; refId: string }) => Promise<NodeResult> | NodeResult;

/** Extraction results waiting for their workflow's first node (kept in memory only). */
export const pendingExtractions = new Map<string, Extraction>();

const S = () => store.get();
const inv = (s: AppState, id: string) => s.invoices.find((i) => i.id === id);
const shp = (s: AppState, id: string) => s.shipments.find((x) => x.id === id);
const failedChecks = (r: { checks: { passed: boolean; label: string; detail: string }[] }) =>
  r.checks.filter((c) => !c.passed).map((c) => `${c.label}: ${c.detail}`).join(' ');

export const HANDLERS: Record<string, Handler> = {
  // ---------- purchase invoice ----------
  'inv.extract': ({ refId }) => {
    const ex = pendingExtractions.get(refId);
    const current = inv(S(), refId);
    if (!ex || !current) return { fail: 'Extraction data is no longer available. Upload the invoice again.' };
    if (ex.confidence < 0.6) {
      store.update((d) => {
        const i = inv(d as AppState, refId)!; i.status = 'extraction_failed'; i.extractionConfidence = ex.confidence;
        const doc = d.documents.find((x) => x.id === current.documentId); if (doc) { doc.status = 'needs_review'; doc.note = `Unreadable: confidence ${pct(ex.confidence)}`; }
      });
      return { fail: `Extraction confidence ${pct(ex.confidence)} is below the 60% threshold. No fields were guessed. Upload a clearer copy or enter the invoice manually.` };
    }
    store.update((d) => {
      const i = inv(d as AppState, refId)!;
      Object.assign(i, { number: ex.number, supplierId: ex.supplierId, supplierName: ex.supplierName, supplierGstin: ex.supplierGstin, date: ex.date, placeOfSupply: ex.placeOfSupply, lines: ex.lines, totals: ex.totals, extractionConfidence: ex.confidence });
      const doc = d.documents.find((x) => x.id === current.documentId); if (doc) { doc.status = 'processed'; doc.note = `Purchase invoice ${ex.number}`; }
    });
    pendingExtractions.delete(refId);
    return { detail: `${ex.lines.length} line item(s), invoice ${ex.number}, total ${inr(ex.totals.total)} · confidence ${pct(ex.confidence)}` };
  },
  'inv.identify': ({ refId }) => {
    const s = S(); const i = inv(s, refId)!;
    const sup = s.suppliers.find((x) => x.gstin === i.supplierGstin);
    if (!sup) return { fail: `Supplier GSTIN ${i.supplierGstin} is not in the supplier list. Ask the owner to confirm the new supplier.` };
    const prior = s.invoices.filter((x) => x.supplierId === sup.id && x.id !== i.id && x.status !== 'duplicate').length;
    const intra = sup.stateCode === i.placeOfSupply;
    return { detail: `${sup.name} (${sup.category}), ${prior} earlier invoice(s). ${intra ? 'Intra-state: CGST + SGST.' : 'Inter-state: IGST.'}` };
  },
  'inv.record': ({ refId }) => {
    const s = S(); const i = inv(s, refId)!;
    const dup = s.invoices.find((x) => x.id !== i.id && x.supplierGstin === i.supplierGstin && normaliseInvoiceNo(x.number) === normaliseInvoiceNo(i.number) && !['duplicate', 'extraction_failed', 'processing'].includes(x.status));
    if (dup) {
      store.update((d) => {
        const x = inv(d as AppState, refId)!; x.status = 'duplicate';
        const doc = d.documents.find((y) => y.id === i.documentId); if (doc) { doc.status = 'needs_review'; doc.note = `Duplicate of ${dup.number}`; }
      });
      return { fail: `Duplicate: ${i.number} from ${i.supplierName} is already in the books (${fmtDate(dup.createdAt)}). No second entry was created.` };
    }
    return { detail: `Draft entry: Purchases ${inr(i.totals.taxable)} + input GST ${inr(totalTax(i.totals))}, payable to ${i.supplierName}.` };
  },
  'inv.lookup': ({ refId }) => {
    const s = S(); const i = inv(s, refId)!;
    const r = findGstRecord(i, s.gstRecords);
    return { detail: r ? `Found in simulated GSTR-2B for ${periodLabel(r.period)} (filed ${fmtDate(r.filedOn)}).` : 'No record from this supplier for this invoice in the GST data.' };
  },
  'inv.match': ({ refId }) => {
    const s = S(); const i = inv(s, refId)!;
    const rec = reconcile(i, s.gstRecords);
    store.update((d) => {
      const x = inv(d as AppState, refId)!;
      x.reconciliation = rec;
      x.status = rec.outcome === 'matched' ? 'matched' : rec.outcome === 'missing_in_gst' ? 'missing_in_gst' : 'mismatch';
    });
    if (rec.outcome === 'matched') {
      log('reconciliation', 'success', `${i.number} matched with supplier GST record`, refId);
      return { branch: 'matched', detail: rec.explanation };
    }
    log('reconciliation', 'warning', `${i.number}: ${rec.outcome === 'missing_in_gst' ? 'not found in supplier filings' : 'value mismatch'}. ITC at risk ${inr(rec.itcAtRisk)}`, refId);
    return { branch: 'mismatch', detail: rec.explanation };
  },
  'inv.reconciled': ({ refId }) => {
    const i = inv(S(), refId)!;
    return { detail: `ITC of ${inr(totalTax(i.totals))} is eligible to claim.` };
  },
  'inv.followup': ({ refId }) => {
    const s = S(); const i = inv(s, refId)!;
    const sup = s.suppliers.find((x) => x.id === i.supplierId)!;
    const period = i.reconciliation?.gstRecordId ? s.gstRecords.find((g) => g.id === i.reconciliation!.gstRecordId)!.period : `${new Date(i.date).getFullYear()}-${String(new Date(i.date).getMonth() + 1).padStart(2, '0')}`;
    const fu = draftFollowUp(i, sup, s.profile, period);
    store.update((d) => {
      d.followUps.unshift(fu);
      const x = inv(d as AppState, refId)!; x.followUpId = fu.id; x.status = 'followup_pending';
    });
    return { detail: `Draft to ${sup.email} asking to ${i.reconciliation?.outcome === 'missing_in_gst' ? 'file' : 'amend'} the record (${inr(fu.amountInQuestion)}).` };
  },
  'inv.verify': ({ refId }) => {
    const s = S(); const i = inv(s, refId)!;
    const fu = i.followUpId ? s.followUps.find((f) => f.id === i.followUpId) : undefined;
    const r = verifyInvoice(s, i, fu);
    store.update((d) => { inv(d as AppState, refId)!.verification = r; });
    if (!r.passed) return { fail: `Verification failed. ${failedChecks(r)}` };
    log('verification', 'success', `${i.number} verified independently: ${r.checks.length}/${r.checks.length} checks passed`, refId);
    return { detail: `${r.checks.length}/${r.checks.length} independent checks passed.` };
  },
  'inv.approval': async ({ refId, runId }) => {
    const s = S(); const i = inv(s, refId)!;
    const fu = s.followUps.find((f) => f.id === i.followUpId)!;
    store.update((d) => { const f = d.followUps.find((x) => x.id === fu.id); if (f) f.status = 'awaiting_approval'; });
    await requestApproval({ kind: 'supplier_followup', title: `Send follow-up to ${i.supplierName}`, summary: `${i.number} · ITC at risk ${inr(fu.amountInQuestion)}`, refId: fu.id, requestedBy: 'reconciliation', workflowRunId: runId, verificationPassed: !!i.verification?.passed });
    return { awaitApproval: true, detail: 'Waiting for the owner to approve this exact message.' };
  },
  end: ({ refId, runId }) => {
    const s = S(); const run = s.runs.find((r) => r.id === runId);
    if (run?.template === 'purchase_invoice') {
      const i = inv(s, refId);
      const msg = i?.status === 'matched' ? `${i.number} recorded and reconciled.` : `${i?.number}: discrepancy found, follow-up approved, ITC of ${inr(i?.reconciliation?.itcAtRisk ?? 0)} held until the supplier corrects it.`;
      toast('success', 'Invoice workflow complete', msg, { label: 'Open invoice', to: `/invoices?open=${refId}` });
      return { detail: msg };
    }
    return { detail: 'Outcome recorded with evidence.' };
  },

  // ---------- dispatch ----------
  'dsp.fields': ({ refId }) => {
    const s = shp(S(), refId);
    if (!s) return { fail: `Shipment ${refId} not found.` };
    const v = validateShipment(s);
    store.update((d) => { const x = shp(d as AppState, refId)!; x.validation = v; });
    const nonVehicle = v.issues.filter((i) => i.severity === 'block' && i.field !== 'vehicleNumber');
    return { detail: nonVehicle.length ? `${nonVehicle.length} blocking issue(s) in shipment details.` : 'Consignee GSTIN, HSN, value, PIN and distance are valid.' };
  },
  'dsp.applicable': ({ refId }) => {
    const s = shp(S(), refId)!;
    return s.validation!.ewayRequired
      ? { branch: 'required', detail: `${inr(s.value)} exceeds ${inr(50000)}: e-way bill required.` }
      : { branch: 'not required', detail: `${inr(s.value)} is within ${inr(50000)}: e-way bill not required.` };
  },
  'dsp.partb': ({ refId }) => {
    const s = shp(S(), refId)!;
    const blocks = s.validation!.issues.filter((i) => i.severity === 'block');
    return blocks.length ? { branch: 'blocked', detail: blocks.map((b) => b.message).join(' ') } : { branch: 'ok', detail: `Vehicle ${s.vehicleNumber.toUpperCase()} valid. Validity ${s.validation!.validityDays} day(s).` };
  },
  'dsp.notreq': ({ refId }) => {
    store.update((d) => { shp(d as AppState, refId)!.status = 'not_required'; });
    log('dispatch', 'success', `${refId}: e-way bill not required (value within threshold). Goods can move with the tax invoice.`, refId);
    toast('success', `${refId} can move`, 'E-way bill not required for this value.');
    return { detail: 'Reason recorded: value within threshold.' };
  },
  'dsp.block': ({ refId }) => {
    const s = shp(S(), refId)!;
    const blocks = s.validation!.issues.filter((i) => i.severity === 'block');
    store.update((d) => { shp(d as AppState, refId)!.status = 'blocked'; });
    const msg = blocks.map((b) => b.message).join(' ');
    log('dispatch', 'error', `${refId} blocked: ${msg}`, refId);
    toast('error', `Shipment ${refId} blocked`, msg, { label: 'Fix shipment', to: `/dispatch?open=${refId}` });
    return { stop: `Blocked: ${msg}`, detail: 'Owner asked for the missing details.' };
  },
  'dsp.draft': ({ refId }) => {
    const s = shp(S(), refId)!;
    store.update((d) => {
      const id = `doc_ewb_${refId}`;
      d.documents = d.documents.filter((x) => x.id !== id);
      d.documents.unshift({ id, name: `eway-draft-${refId}.json`, type: 'eway_draft', sizeKb: 3, uploadedAt: nowIso(), status: 'processed', linkedId: refId, source: 'generated', note: 'Draft prepared. Not submitted to the e-way bill portal.' });
    });
    return { detail: `Part-A: ${s.invoiceNumber}, HSN ${s.hsn}, ${inr(s.value)}. Part-B: road, ${s.vehicleNumber.toUpperCase()}.` };
  },
  'dsp.verify': ({ refId }) => {
    const r = verifyShipment(shp(S(), refId)!);
    if (!r.passed) return { fail: `Verification failed. ${failedChecks(r)}` };
    log('verification', 'success', `${refId} verified: ${r.checks.length}/${r.checks.length} checks passed`, refId);
    return { detail: `${r.checks.length}/${r.checks.length} independent checks passed.` };
  },
  'dsp.approval': async ({ refId, runId }) => {
    const s = shp(S(), refId)!;
    store.update((d) => { shp(d as AppState, refId)!.status = 'awaiting_approval'; });
    await requestApproval({ kind: 'eway_bill', title: `Generate e-way bill for ${refId}`, summary: `${s.consignee} · ${inr(s.value)} · ${s.vehicleNumber.toUpperCase()}`, refId, requestedBy: 'dispatch', workflowRunId: runId, verificationPassed: true });
    return { awaitApproval: true, detail: 'Waiting for owner approval.' };
  },
  'dsp.generate': ({ refId }) => {
    const n = String(Math.floor(1e11 + Math.random() * 9e11));
    const ewb = `SIM-${n.slice(0, 4)} ${n.slice(4, 8)} ${n.slice(8, 12)}`;
    store.update((d) => { const x = shp(d as AppState, refId)!; x.status = 'eway_generated'; x.ewbNumber = ewb; });
    log('dispatch', 'success', `E-way bill generated for ${refId} (simulated): ${ewb}`, refId);
    toast('success', `${refId} ready to move`, `Simulated e-way bill ${ewb}. Nothing was sent to the portal.`);
    return { detail: `${ewb} (simulated, not registered with the portal).` };
  },

  // ---------- GSTR-3B readiness ----------
  'gst.collect': ({ refId }) => {
    const sum = gstr3bSummary(S(), refId);
    return { detail: `${sum.invoiceCount} purchase invoice(s) for ${periodLabel(refId)}.` };
  },
  'gst.reconcile': ({ refId }) => {
    const sum = gstr3bSummary(S(), refId);
    if (sum.pendingReview) return { fail: `${sum.pendingReview} invoice(s) for this period are still processing. Wait for them to finish.` };
    return { detail: sum.itcAtRisk ? `${inr(sum.itcAtRisk)} ITC at risk will be held back.` : 'All ITC matched with supplier filings.' };
  },
  'gst.summary': ({ refId }) => {
    const sum = gstr3bSummary(S(), refId);
    return { detail: `Output tax ${inr(sum.outputTax)} − eligible ITC ${inr(sum.eligibleItc)} = ${inr(sum.netPayable)} payable.` };
  },
  'gst.paper': ({ refId }) => {
    const sum = gstr3bSummary(S(), refId);
    const id = `wp_${refId}`;
    store.update((d) => {
      d.workingPapers = d.workingPapers.filter((p) => p.id !== id);
      d.workingPapers.unshift({ id, form: 'GSTR-3B', period: refId, createdAt: nowIso(), status: 'prepared', rows: [
        { label: 'Outward taxable value', value: sum.outwardTaxable },
        { label: 'Output tax', value: sum.outputTax },
        { label: 'Eligible ITC (matched)', value: sum.eligibleItc },
        { label: 'ITC at risk (held back)', value: sum.itcAtRisk },
        { label: 'Net tax payable (cash)', value: sum.netPayable },
      ] });
      d.documents = d.documents.filter((x) => x.id !== `doc_${id}`);
      d.documents.unshift({ id: `doc_${id}`, name: `gstr3b-working-paper-${refId}.csv`, type: 'working_paper', sizeKb: 2, uploadedAt: nowIso(), status: 'processed', linkedId: id, source: 'generated', note: 'Prepared for review. Not filed.' });
    });
    return { detail: 'Working paper with 5 rows prepared.' };
  },
  'gst.verify': ({ refId }) => {
    const s = S(); const p = s.workingPapers.find((x) => x.id === `wp_${refId}`)!;
    const r = verifyWorkingPaper(s, p);
    if (!r.passed) return { fail: `Verification failed. ${failedChecks(r)}` };
    log('verification', 'success', `GSTR-3B working paper ${refId} recomputed: ${r.checks.length}/${r.checks.length} checks passed`, p.id);
    return { detail: `${r.checks.length}/${r.checks.length} rows recomputed independently.` };
  },
  'gst.approval': async ({ refId, runId }) => {
    const id = `wp_${refId}`;
    const p = S().workingPapers.find((x) => x.id === id)!;
    store.update((d) => { const x = d.workingPapers.find((w) => w.id === id); if (x) x.status = 'awaiting_approval'; });
    await requestApproval({ kind: 'gst_return', title: `Submit GSTR-3B for ${periodLabel(refId)} (simulated)`, summary: `Net payable ${inr(p.rows.find((r) => r.label.startsWith('Net'))!.value)}`, refId: id, requestedBy: 'compliance', workflowRunId: runId, verificationPassed: true });
    return { awaitApproval: true, detail: 'Statutory declaration: waiting for the owner.' };
  },
  'gst.submit': ({ refId }) => {
    store.update((d) => {
      const p = d.workingPapers.find((w) => w.id === `wp_${refId}`); if (p) p.status = 'approved_simulated';
      const dl = d.deadlines.find((x) => x.form === 'GSTR-3B' && x.period === refId); if (dl) { dl.status = 'filed'; dl.filedOn = nowIso(); dl.simulated = true; }
    });
    log('compliance', 'success', `GSTR-3B ${refId} marked submitted (simulated: nothing was sent to the GST portal)`, refId);
    toast('success', 'GSTR-3B marked submitted (simulated)', 'In demo mode nothing is sent to the GST portal.');
    return { detail: 'Simulated submission recorded.' };
  },
};

export const REGISTRY = new Set(Object.keys(HANDLERS));
