// Workflow Builder (separate planning agent).
// Produces a validated execution graph from an objective + business context.
// Graphs reference only handlers from the approved registry (see engine/handlers.ts);
// no free-form code is ever generated or executed.
import type { AgentId, BusinessProfile, Invoice, NodeKind, Shipment, Supplier, WorkflowEdge, WorkflowNode, WorkflowTemplate } from '@/types';
import { EWAY_THRESHOLD } from '@/lib/gst';
import { inr } from '@/lib/format';

export interface BuildContext {
  profile: BusinessProfile;
  supplier?: Supplier;
  invoice?: Invoice;
  shipment?: Shipment;
  period?: string;
}

export interface BuiltWorkflow {
  objective: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  notes: string[];
}

export const TEMPLATE_LABEL: Record<WorkflowTemplate, string> = {
  purchase_invoice: 'Process a purchase invoice',
  dispatch_check: 'Validate a dispatch',
  gst_readiness: 'Prepare GSTR-3B',
};

type Spec = [id: string, label: string, agent: AgentId, kind: NodeKind, handler: string, col: number, row: number, rationale: string];

const toNodes = (specs: Spec[]): WorkflowNode[] =>
  specs.map(([id, label, agent, kind, handler, col, row, rationale]) => ({ id, label, agent, kind, handler, col, row, rationale, status: 'pending' }));

export function buildWorkflow(template: WorkflowTemplate, ctx: BuildContext): BuiltWorkflow {
  switch (template) {
    case 'purchase_invoice': return purchaseInvoice(ctx);
    case 'dispatch_check': return dispatchCheck(ctx);
    case 'gst_readiness': return gstReadiness(ctx);
  }
}

function purchaseInvoice(ctx: BuildContext): BuiltWorkflow {
  const regular = ctx.profile.registrationType === 'regular';
  const notes = [
    `Business context: ${ctx.profile.fields.find((f) => f.key === 'type')?.value ?? 'business'}, ${regular ? 'regular GST registrant' : 'composition scheme'}.`,
    regular ? 'Regular registrant, so input tax credit must be matched against supplier-filed records.' : 'Composition scheme: no ITC, so GST record matching is left out.',
    'Supplier follow-ups contact an external party, so an owner approval checkpoint is added on that branch.',
  ];
  const specs: Spec[] = [
    ['extract', 'Extract invoice fields', 'document', 'task', 'inv.extract', 0, 0, 'Every purchase starts from the document itself.'],
    ['identify', 'Identify supplier', 'document', 'task', 'inv.identify', 1, 0, 'Supplier GSTIN links the invoice to the business’s supplier records.'],
    ['record', 'Draft purchase record', 'document', 'task', 'inv.record', 2, 0, 'Prepares the bookkeeping entry and blocks duplicates before anything else.'],
  ];
  const edges: WorkflowEdge[] = [{ from: 'extract', to: 'identify' }, { from: 'identify', to: 'record' }];
  if (regular) {
    specs.push(
      ['lookup', 'Look up supplier GST record', 'reconciliation', 'task', 'inv.lookup', 3, 0, 'Needed because ITC depends on what the supplier filed.'],
      ['match', 'Values match?', 'reconciliation', 'decision', 'inv.match', 4, 0, 'Rule engine compares taxable value and tax (₹1 tolerance).'],
      ['reconciled', 'Mark reconciled', 'reconciliation', 'task', 'inv.reconciled', 5, 0, 'Matched invoices need no further action.'],
      ['verify', 'Independent verification', 'verification', 'task', 'inv.verify', 6, 0, 'Verification Agent recomputes from line items before closing.'],
      ['followup', 'Draft supplier follow-up', 'reconciliation', 'task', 'inv.followup', 5, 1, 'A mismatch needs the supplier to correct their filing.'],
      ['verifyF', 'Independent verification', 'verification', 'task', 'inv.verify', 6, 1, 'Checks the draft quotes the recomputed amount before anyone sees it.'],
      ['approval', 'Owner approval', 'core', 'approval', 'inv.approval', 7, 1, 'External communication requires the owner’s approval of this exact message.'],
      ['done', 'Completion summary', 'core', 'end', 'end', 8, 0, 'Records the outcome and evidence.'],
    );
    edges.push(
      { from: 'record', to: 'lookup' }, { from: 'lookup', to: 'match' },
      { from: 'match', to: 'reconciled', label: 'matched' }, { from: 'match', to: 'followup', label: 'mismatch' },
      { from: 'reconciled', to: 'verify' }, { from: 'verify', to: 'done' },
      { from: 'followup', to: 'verifyF' }, { from: 'verifyF', to: 'approval' }, { from: 'approval', to: 'done' },
    );
  } else {
    specs.push(
      ['verify', 'Independent verification', 'verification', 'task', 'inv.verify', 3, 0, 'Verification still recomputes the arithmetic.'],
      ['done', 'Completion summary', 'core', 'end', 'end', 4, 0, 'Records the outcome and evidence.'],
    );
    edges.push({ from: 'record', to: 'verify' }, { from: 'verify', to: 'done' });
  }
  return { objective: 'Process this purchase invoice and check whether it is correct', nodes: toNodes(specs), edges, notes };
}

function dispatchCheck(ctx: BuildContext): BuiltWorkflow {
  const s = ctx.shipment;
  const notes = [
    s ? `Consignment value ${inr(s.value)} against the ${inr(EWAY_THRESHOLD)} e-way bill threshold.` : 'Applicability depends on consignment value.',
    'Goods cannot move without Part-B (vehicle details), so a blocking branch is included.',
    'Generating an e-way bill is a statutory action, so it needs owner approval.',
  ];
  const specs: Spec[] = [
    ['fields', 'Check dispatch details', 'dispatch', 'task', 'dsp.fields', 0, 0, 'Validates GSTIN, HSN, value, PIN and distance with the rule engine.'],
    ['applicable', 'E-way bill required?', 'dispatch', 'decision', 'dsp.applicable', 1, 0, 'Applicability is a rule, not a guess.'],
    ['partb', 'Ready to move?', 'dispatch', 'decision', 'dsp.partb', 2, 0, 'Checks Part-B: vehicle number present and valid.'],
    ['notreq', 'Record: not required', 'dispatch', 'end', 'dsp.notreq', 2, 2, 'Below threshold: the reason is recorded as evidence.'],
    ['block', 'Block shipment', 'core', 'end', 'dsp.block', 3, 1, 'Stops the dispatch and asks the owner for the missing details.'],
    ['draft', 'Prepare e-way bill draft', 'dispatch', 'task', 'dsp.draft', 3, 0, 'Builds the Part-A/Part-B draft from validated fields.'],
    ['verify', 'Independent verification', 'verification', 'task', 'dsp.verify', 4, 0, 'Re-derives applicability, validity and vehicle format.'],
    ['approval', 'Owner approval', 'core', 'approval', 'dsp.approval', 5, 0, 'Statutory action: approval bound to this exact payload.'],
    ['generate', 'Generate e-way bill (simulated)', 'dispatch', 'task', 'dsp.generate', 6, 0, 'Demo mode: no request is sent to the e-way bill portal.'],
  ];
  const edges: WorkflowEdge[] = [
    { from: 'fields', to: 'applicable' },
    { from: 'applicable', to: 'partb', label: 'required' }, { from: 'applicable', to: 'notreq', label: 'not required' },
    { from: 'partb', to: 'draft', label: 'ok' }, { from: 'partb', to: 'block', label: 'blocked' },
    { from: 'draft', to: 'verify' }, { from: 'verify', to: 'approval' }, { from: 'approval', to: 'generate' },
  ];
  return { objective: `Validate dispatch ${s?.id ?? ''} and prepare its e-way bill`.trim(), nodes: toNodes(specs), edges, notes };
}

function gstReadiness(ctx: BuildContext): BuiltWorkflow {
  const notes = [
    `Period ${ctx.period}. Figures come from the rule engine, not from a language model.`,
    'ITC at risk is held back from the claim until suppliers correct their filings.',
    'Submission is statutory, so it requires owner approval. In demo mode the submission is simulated.',
  ];
  const specs: Spec[] = [
    ['collect', 'Collect purchase records', 'document', 'task', 'gst.collect', 0, 0, 'Uses every processed invoice for the period.'],
    ['reconcile', 'Confirm reconciliation status', 'reconciliation', 'task', 'gst.reconcile', 1, 0, 'Only matched ITC is claimed.'],
    ['summary', 'Compute GSTR-3B summary', 'compliance', 'task', 'gst.summary', 2, 0, 'Deterministic calculation of output tax, ITC and net payable.'],
    ['paper', 'Prepare working paper', 'compliance', 'task', 'gst.paper', 3, 0, 'Produces a reviewable, downloadable working paper.'],
    ['verify', 'Independent verification', 'verification', 'task', 'gst.verify', 4, 0, 'Recomputes every row from source invoices.'],
    ['approval', 'Owner approval', 'core', 'approval', 'gst.approval', 5, 0, 'Statutory declaration stays with the owner.'],
    ['submit', 'Mark submitted (simulated)', 'compliance', 'task', 'gst.submit', 6, 0, 'Demo mode: nothing is sent to the GST portal.'],
  ];
  const edges = specs.slice(1).map((s, i) => ({ from: specs[i][0], to: s[0] }));
  return { objective: `Prepare GSTR-3B working paper for ${ctx.period}`, nodes: toNodes(specs), edges, notes };
}

/** Structural validation: every edge points at a known node, every handler is registered, no cycles. */
export function validateGraph(nodes: WorkflowNode[], edges: WorkflowEdge[], registry: Set<string>) {
  const ids = new Set(nodes.map((n) => n.id));
  const errors: string[] = [];
  for (const e of edges) if (!ids.has(e.from) || !ids.has(e.to)) errors.push(`Edge ${e.from}→${e.to} references an unknown node`);
  for (const n of nodes) if (!registry.has(n.handler)) errors.push(`Handler ${n.handler} is not in the approved registry`);
  const visiting = new Set<string>();
  const done = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return false;
    if (done.has(id)) return true;
    visiting.add(id);
    for (const e of edges.filter((x) => x.from === id)) if (!visit(e.to)) return false;
    visiting.delete(id);
    done.add(id);
    return true;
  };
  if (nodes[0] && !visit(nodes[0].id)) errors.push('Graph contains a cycle');
  return errors;
}
