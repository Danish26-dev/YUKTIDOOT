// User-facing commands. Components call these; these call services, the engine and the store.
// A real backend would replace this module with API calls returning the same shapes.
import type { AppState, Approval, DocumentItem, Invoice, ProfileField, Shipment } from '@/types';
import { store, log } from './store';
import { toast } from './toast';
import { nowIso, uid } from '@/lib/util';
import { inr } from '@/lib/format';
import { totalTax, validateGstin } from '@/lib/gst';
import { classifyDocument, extract, pickSample, validateUpload } from '@/services/extraction';
import { SAMPLE_INVOICES, type SampleInvoice } from '@/data/samples';
import { previousPeriod } from '@/data/dates';
import { reconcile } from '@/services/reconciliation';
import { verifyInvoice } from '@/services/verification';
import { inference, type PhotoAnalysis } from '@/services/inference';
import { pendingExtractions } from '@/engine/handlers';
import { resumeAfterDecision, startWorkflow, stopRun } from '@/engine/engine';
import { approvalIsCurrent, requestApproval, supersedeApprovals } from '@/engine/approvals';

type FileLike = { name: string; type: string; size: number };

// ---------- documents & invoices ----------

/** Upload a purchase invoice (real file or named sample) and start the invoice workflow. */
export async function uploadInvoice(file: FileLike, forcedSample?: SampleInvoice): Promise<string | null> {
  const err = validateUpload(file);
  if (err) { toast('error', 'Upload rejected', err); return null; }
  const s = store.get();
  const used = new Set(s.documents.map((d) => d.sampleKey ?? '').filter(Boolean));
  const sample = forcedSample ?? pickSample(file.name, used);
  const genericSeq = s.invoices.filter((i) => i.supplierId === 'sup_ajanta').length;
  const ex = extract(sample, s.suppliers, genericSeq);

  const invoiceId = uid('inv');
  const docId = uid('doc');
  const runId = uid('run');
  const placeholder: Invoice = {
    id: invoiceId, workflowRunId: runId, number: 'Reading…', supplierId: '', supplierName: 'Identifying supplier…', supplierGstin: '', date: nowIso(), placeOfSupply: '27',
    lines: [], totals: { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 }, status: 'processing', documentId: docId, createdAt: nowIso(),
  };
  store.update((d) => {
    d.documents.unshift({ id: docId, name: file.name, type: 'purchase_invoice', sizeKb: Math.max(1, Math.round(file.size / 1024)), uploadedAt: nowIso(), status: 'processing', linkedId: invoiceId, source: forcedSample ? 'sample' : 'upload', sampleKey: sample.key, note: 'Extracting fields…' });
    d.invoices.unshift(placeholder);
  });
  pendingExtractions.set(invoiceId, ex);
  log('owner', 'info', `Uploaded ${file.name}`, invoiceId);
  void startWorkflow('purchase_invoice', invoiceId, { profile: store.get().profile, invoice: placeholder }, runId);
  return invoiceId;
}

export function uploadSampleInvoice(key: SampleInvoice['key']) {
  const sample = SAMPLE_INVOICES.find((x) => x.key === key)!;
  const type = sample.fileName.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg';
  return uploadInvoice({ name: sample.fileName, type, size: 180_000 + sample.lines.length * 21_000 }, sample);
}

/** Generic document upload: classify, then route invoices into the invoice workflow. */
export async function uploadDocument(file: FileLike): Promise<DocumentItem['type'] | null> {
  const err = validateUpload(file);
  if (err) { toast('error', 'Upload rejected', err); return null; }
  const type = classifyDocument(file.name, file.type);
  if (type === 'purchase_invoice') { await uploadInvoice(file); return type; }
  const doc: DocumentItem = {
    id: uid('doc'), name: file.name, type, sizeKb: Math.max(1, Math.round(file.size / 1024)), uploadedAt: nowIso(), source: 'upload',
    status: type === 'other' ? 'needs_review' : 'processed',
    note: type === 'other' ? 'Could not classify. Please choose a type.' : type === 'business_photo' ? 'Can be used to refine the Business Context Profile' : 'Expense receipt filed',
  };
  store.update((d) => { d.documents.unshift(doc); });
  log('document', type === 'other' ? 'warning' : 'success', `${file.name} classified as ${type.replace('_', ' ')}`, doc.id);
  toast(type === 'other' ? 'warning' : 'success', type === 'other' ? 'Needs review' : 'Document filed', `${file.name} → ${type.replace('_', ' ')}`);
  return type;
}

export function reclassifyDocument(id: string, type: DocumentItem['type']) {
  store.update((d) => { const x = d.documents.find((y) => y.id === id); if (x) { x.type = type; x.status = 'processed'; x.note = 'Type set by owner'; } });
  log('owner', 'info', `Document type set to ${type.replace('_', ' ')}`, id);
}

export function deleteDocument(id: string) {
  const doc = store.get().documents.find((d) => d.id === id);
  if (doc?.linkedId && store.get().invoices.some((i) => i.id === doc.linkedId && i.status !== 'extraction_failed' && i.status !== 'duplicate')) {
    toast('error', 'Cannot delete', 'This document is evidence for a recorded invoice.');
    return false;
  }
  store.update((d) => {
    d.documents = d.documents.filter((x) => x.id !== id);
    if (doc?.linkedId) d.invoices = d.invoices.filter((i) => !(i.id === doc.linkedId && (i.status === 'extraction_failed' || i.status === 'duplicate')));
  });
  log('owner', 'info', `Deleted ${doc?.name}`, id);
  return true;
}

/** Demo-only helper: pretend the supplier amended their filing, then reconcile and verify again. */
export function simulateSupplierCorrection(invoiceId: string) {
  const s = store.get();
  const i = s.invoices.find((x) => x.id === invoiceId);
  if (!i) return;
  store.update((d) => {
    const rec = d.gstRecords.find((g) => g.supplierGstin === i.supplierGstin && g.invoiceNumber === i.number);
    if (rec) { rec.taxableValue = i.totals.taxable; rec.taxAmount = totalTax(i.totals); rec.filedOn = nowIso(); }
    else d.gstRecords.push({ id: uid('gr'), supplierGstin: i.supplierGstin, invoiceNumber: i.number, invoiceDate: i.date, taxableValue: i.totals.taxable, taxAmount: totalTax(i.totals), period: previousPeriod(), filedOn: nowIso() });
  });
  log('reconciliation', 'info', `Supplier record for ${i.number} updated (simulated amendment)`, invoiceId);
  const after = store.get();
  const fresh = after.invoices.find((x) => x.id === invoiceId)!;
  const rec = reconcile(fresh, after.gstRecords);
  store.update((d) => { const x = d.invoices.find((y) => y.id === invoiceId)!; x.reconciliation = rec; });
  const v = verifyInvoice(store.get(), store.get().invoices.find((x) => x.id === invoiceId)!);
  store.update((d) => {
    const x = d.invoices.find((y) => y.id === invoiceId)!;
    x.verification = v;
    if (rec.outcome === 'matched' && v.passed) x.status = 'resolved';
  });
  if (rec.outcome === 'matched' && v.passed) {
    log('verification', 'success', `${i.number} re-verified after supplier correction: resolved`, invoiceId);
    toast('success', 'Discrepancy resolved', `${i.number} now matches the supplier’s filing. ITC ${inr(totalTax(i.totals))} is eligible.`);
  } else toast('warning', 'Still not matching', rec.explanation);
}

/** Re-run the rule engine for every processed invoice in a period against the current GST data. */
export function rerunReconciliation(period: string) {
  const s = store.get();
  const targets = s.invoices.filter((i) => i.reconciliation && !['processing', 'duplicate', 'extraction_failed'].includes(i.status) && periodKey(i.date) === period);
  let changed = 0;
  store.update((d) => {
    for (const t of targets) {
      const x = d.invoices.find((y) => y.id === t.id)!;
      const rec = reconcile(t, s.gstRecords);
      if (rec.outcome !== t.reconciliation!.outcome) changed++;
      x.reconciliation = rec;
      if (rec.outcome === 'matched' && t.status !== 'matched') x.status = 'resolved';
      if (rec.outcome !== 'matched' && (t.status === 'matched' || t.status === 'resolved')) x.status = rec.outcome === 'missing_in_gst' ? 'missing_in_gst' : 'mismatch';
    }
  });
  log('reconciliation', 'info', `Re-ran reconciliation for ${period}: ${targets.length} invoice(s), ${changed} changed`, period);
  toast('success', 'Reconciliation refreshed', `${targets.length} invoice(s) re-checked, ${changed} changed.`);
}
const periodKey = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };

// ---------- follow-ups & approvals ----------

export async function editFollowUp(followUpId: string, subject: string, body: string) {
  const f = store.get().followUps.find((x) => x.id === followUpId);
  if (!f) return;
  if (f.status === 'approved') { toast('error', 'Already approved', 'Approved messages cannot be edited.'); return; }
  store.update((d) => { const x = d.followUps.find((y) => y.id === followUpId)!; x.subject = subject; x.body = body; x.version += 1; x.status = 'draft'; });
  const n = supersedeApprovals('supplier_followup', followUpId, `Message edited (now v${f.version + 1}). The earlier approval no longer applies.`);
  log('owner', 'info', `Edited follow-up to supplier (v${f.version + 1})`, followUpId);

  const s = store.get();
  const inv = s.invoices.find((i) => i.id === f.invoiceId)!;
  const fu = s.followUps.find((x) => x.id === followUpId)!;
  const report = verifyInvoice(s, inv, fu);
  store.update((d) => { d.invoices.find((i) => i.id === inv.id)!.verification = report; });
  if (!report.passed) {
    log('verification', 'error', `Edited follow-up failed verification: ${report.checks.filter((c) => !c.passed).map((c) => c.label).join(', ')}`, followUpId);
    toast('error', 'Edited draft failed verification', report.checks.filter((c) => !c.passed).map((c) => c.detail).join(' '));
    return;
  }
  log('verification', 'success', `Edited follow-up re-verified (v${fu.version})`, followUpId);
  store.update((d) => { d.followUps.find((x) => x.id === followUpId)!.status = 'awaiting_approval'; });
  const run = s.runs.find((r) => r.id === inv.workflowRunId && r.status === 'waiting_approval');
  await requestApproval({ kind: 'supplier_followup', title: `Send follow-up to ${inv.supplierName}`, summary: `${inv.number} · ITC at risk ${inr(fu.amountInQuestion)} · v${fu.version}`, refId: followUpId, requestedBy: 'reconciliation', workflowRunId: run?.id, verificationPassed: true });
  if (n) toast('warning', 'Previous approval superseded', 'A new approval request was created for the edited message.');
}

export async function approve(approvalId: string, note = '') {
  const a = store.get().approvals.find((x) => x.id === approvalId);
  if (!a || a.status !== 'pending') { toast('error', 'Approval is no longer pending'); return false; }
  if (!a.verificationPassed) { toast('error', 'Cannot approve', 'Independent verification has not passed for this item.'); return false; }
  if (!(await approvalIsCurrent(a))) {
    supersedeApprovals(a.kind, a.refId, 'Payload changed after the request. Re-verification required.');
    toast('error', 'Payload changed', 'The data changed after this approval was requested, so it was not applied.');
    return false;
  }
  store.update((d) => {
    const x = d.approvals.find((y) => y.id === approvalId)!;
    x.status = 'approved'; x.decidedAt = nowIso(); x.decisionNote = note || 'Approved';
    if (a.kind === 'supplier_followup') {
      const f = d.followUps.find((y) => y.id === a.refId)!; f.status = 'approved'; f.approvedAt = nowIso();
      const i = d.invoices.find((y) => y.id === f.invoiceId); if (i) i.status = 'followup_approved';
    }
  });
  log('owner', 'approval', `Approved: ${a.title}`, approvalId);
  toast('success', 'Approved', a.title);
  if (a.workflowRunId) await resumeAfterDecision(a.workflowRunId, true, `Approved by owner (payload ${a.payloadHash.slice(0, 19)}…)`);
  return true;
}

export async function reject(approvalId: string, note = '') {
  const a = store.get().approvals.find((x) => x.id === approvalId);
  if (!a || a.status !== 'pending') return;
  store.update((d) => {
    const x = d.approvals.find((y) => y.id === approvalId)!;
    x.status = 'rejected'; x.decidedAt = nowIso(); x.decisionNote = note || 'Rejected';
    if (a.kind === 'supplier_followup') {
      const f = d.followUps.find((y) => y.id === a.refId); if (f) f.status = 'rejected';
      const i = d.invoices.find((y) => y.id === f?.invoiceId); if (i) i.status = i.reconciliation?.outcome === 'missing_in_gst' ? 'missing_in_gst' : 'mismatch';
    }
    if (a.kind === 'eway_bill') { const s = d.shipments.find((y) => y.id === a.refId); if (s) s.status = 'draft'; }
    if (a.kind === 'gst_return') { const p = d.workingPapers.find((y) => y.id === a.refId); if (p) p.status = 'rejected'; }
  });
  log('owner', 'approval', `Rejected: ${a.title}${note ? ` (${note})` : ''}`, approvalId);
  toast('info', 'Rejected', 'Nothing was sent. The item stays open for review.');
  if (a.workflowRunId) await resumeAfterDecision(a.workflowRunId, false, note ? `Rejected: ${note}` : 'Rejected by owner');
}

// ---------- dispatch ----------

export async function validateDispatch(shipmentId: string) {
  const s = store.get().shipments.find((x) => x.id === shipmentId);
  if (!s) return;
  if (s.status === 'eway_generated') { toast('info', 'Already done', `${s.id} already has an e-way bill.`); return; }
  if (s.status === 'awaiting_approval') { toast('info', 'Awaiting approval', 'Approve or reject the pending e-way bill first.'); return; }
  const runId = uid('run');
  store.update((d) => { const x = d.shipments.find((y) => y.id === shipmentId); if (x) x.workflowRunId = runId; });
  await startWorkflow('dispatch_check', shipmentId, { profile: store.get().profile, shipment: s }, runId);
}

export function updateShipment(id: string, patch: Partial<Shipment>) {
  const before = store.get().shipments.find((x) => x.id === id);
  if (!before) return;
  if (before.status === 'eway_generated') { toast('error', 'Locked', 'An e-way bill was already generated for this shipment.'); return; }
  store.update((d) => {
    const s = d.shipments.find((x) => x.id === id)!;
    Object.assign(s, patch);
    s.status = 'draft';
    s.validation = undefined;
  });
  if (before.status === 'awaiting_approval') {
    supersedeApprovals('eway_bill', id, 'Shipment details changed after the approval request.');
    if (before.workflowRunId) stopRun(before.workflowRunId, 'Shipment changed during approval. Validate again.');
    toast('warning', 'Approval superseded', 'Shipment details changed. Validate the shipment again.');
  }
  log('owner', 'info', `Updated shipment ${id}: ${Object.keys(patch).join(', ')}`, id);
}

export function createShipment(data: Omit<Shipment, 'id' | 'status' | 'createdAt' | 'fromPin'>) {
  const n = 1044 + store.get().shipments.filter((s) => /^SH-\d+$/.test(s.id) && Number(s.id.slice(3)) >= 1044).length;
  const id = `SH-${n}`;
  store.update((d) => { d.shipments.unshift({ ...data, id, fromPin: '411026', status: 'draft', createdAt: nowIso() }); });
  log('owner', 'info', `Created shipment ${id} to ${data.consignee}`, id);
  toast('success', `Shipment ${id} created`, 'Validate it before the goods move.');
  return id;
}

// ---------- compliance ----------

export async function prepareGstr3b(period = previousPeriod()) {
  const existing = store.get().runs.find((r) => r.template === 'gst_readiness' && r.refId === period && (r.status === 'running' || r.status === 'waiting_approval' || r.status === 'planning'));
  if (existing) { toast('info', 'Already in progress', 'Open the Workflow Center to follow it.', { label: 'Open', to: `/workflows?run=${existing.id}` }); return; }
  const dl = store.get().deadlines.find((d) => d.form === 'GSTR-3B' && d.period === period);
  if (dl?.status === 'filed') { toast('info', 'Already marked submitted', 'This period was already marked as submitted.'); return; }
  supersedeApprovals('gst_return', `wp_${period}`, 'Working paper is being re-prepared.');
  await startWorkflow('gst_readiness', period, { profile: store.get().profile, period });
}

// ---------- business profile ----------

export async function analysePhoto(file: Blob | null): Promise<PhotoAnalysis> {
  setAgentTask('Analysing business photograph');
  try {
    const result = await inference.analyseBusinessPhoto(file);
    log('core', 'success', `Photo analysed: ${result.summary}`, 'profile');
    return result;
  } finally {
    setAgentTask(undefined);
  }
}

function setAgentTask(task?: string) {
  store.update((d) => { d.agents.core.status = task ? 'running' : 'idle'; d.agents.core.currentTask = task; d.agents.core.lastActive = nowIso(); });
}

export interface OnboardingAnswers { legalName: string; gstin: string; suppliers: string; turnover: string; ownerName: string }

export function confirmProfile(analysis: PhotoAnalysis, accepted: Record<string, boolean>, answers: OnboardingAnswers) {
  const g = validateGstin(answers.gstin);
  if (!g.valid) { toast('error', 'GSTIN not accepted', g.reason); return false; }
  const gstin = answers.gstin.trim().toUpperCase();
  const fields: ProfileField[] = [
    ...analysis.fields.map<ProfileField>((f) => ({ key: f.key, label: f.label, value: f.value.replace(/ \(likely\)$/, ''), source: accepted[f.key] ? 'owner_confirmed' : 'photo_inferred', confidence: f.confidence, note: accepted[f.key] ? `Inferred from photo (${Math.round(f.confidence * 100)}%), confirmed by owner` : 'Inferred from photo, not yet confirmed' })),
    { key: 'legalName', label: 'Legal name', value: answers.legalName.trim(), source: 'owner_confirmed' },
    { key: 'gstin', label: 'GSTIN', value: gstin, source: 'owner_confirmed', note: 'Format and checksum valid. Not verified with GSTN in demo mode.' },
    { key: 'location', label: 'Location', value: `State code ${gstin.slice(0, 2)} (from GSTIN)`, source: 'document_derived' },
    { key: 'turnover', label: 'Turnover band', value: answers.turnover, source: 'owner_confirmed' },
    { key: 'suppliers', label: 'Main suppliers', value: answers.suppliers.trim() || 'Not provided yet (will be learned from invoices)', source: answers.suppliers.trim() ? 'owner_confirmed' : 'missing' },
  ];
  const prev = store.get().profile.fields;
  for (const key of ['filing', 'customers', 'tds']) { const f = prev.find((x) => x.key === key); if (f) fields.push(f); }
  store.update((d) => {
    d.profile.fields = fields;
    d.profile.businessName = answers.legalName.trim();
    d.profile.ownerName = answers.ownerName.trim() || d.profile.ownerName;
    d.profile.gstin = gstin;
    d.profile.stateCode = gstin.slice(0, 2);
    d.profile.photoAnalysedAt = nowIso();
    d.profile.onboardedAt = nowIso();
  });
  log('core', 'success', `Business Context Profile ${prev.length ? 'rebuilt' : 'created'} from photo + owner answers (${fields.length} fields)`, 'profile');
  toast('success', 'Business profile saved', 'Agents will use this context from now on.');
  return true;
}

export function updateProfileField(key: string, value: string) {
  store.update((d) => {
    const f = d.profile.fields.find((x) => x.key === key);
    if (f) { f.value = value; f.source = 'owner_confirmed'; f.note = 'Edited by owner'; f.confidence = undefined; }
  });
  log('owner', 'info', `Profile field updated: ${key}`, 'profile');
}

export function setRegistrationType(t: AppState['profile']['registrationType']) {
  store.update((d) => { d.profile.registrationType = t; });
  log('owner', 'info', `Registration type set to ${t}. Workflow Builder will plan accordingly.`, 'profile');
  toast('info', 'Context updated', t === 'composition' ? 'New invoice workflows will skip ITC matching (composition scheme).' : 'New invoice workflows include ITC matching.');
}

// ---------- demo ----------
export function resetDemo() {
  pendingExtractions.clear();
  store.reset();
  toast('success', 'Demo data reset', 'Everything is back to the starting state.');
}

export type { Approval };
