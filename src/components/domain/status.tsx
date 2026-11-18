import type { AgentId, AgentStatus, Approval, DocumentItem, InvoiceStatus, NodeStatus, RunStatus, ShipmentStatus } from '@/types';
import { Badge, type Tone } from '@/components/ui/primitives';

const INVOICE: Record<InvoiceStatus, [string, Tone]> = {
  processing: ['Processing', 'cobalt'],
  matched: ['Matched', 'ok'],
  mismatch: ['Mismatch', 'bad'],
  missing_in_gst: ['Not in GST records', 'bad'],
  followup_pending: ['Follow-up awaiting approval', 'sun'],
  followup_approved: ['Follow-up approved', 'sun'],
  resolved: ['Resolved', 'ok'],
  extraction_failed: ['Needs manual review', 'bad'],
  duplicate: ['Duplicate blocked', 'neutral'],
};
export const invoiceStatusLabel = (s: InvoiceStatus) => INVOICE[s][0];
export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  const [l, t] = INVOICE[status];
  return <Badge tone={t} dot>{l}</Badge>;
}

const SHIPMENT: Record<ShipmentStatus, [string, Tone]> = {
  draft: ['Not validated', 'neutral'],
  blocked: ['Blocked', 'bad'],
  ready: ['Ready', 'cobalt'],
  awaiting_approval: ['Awaiting approval', 'sun'],
  eway_generated: ['E-way bill ready (sim.)', 'ok'],
  not_required: ['No e-way bill needed', 'ok'],
};
export function ShipmentStatusBadge({ status }: { status: ShipmentStatus }) {
  const [l, t] = SHIPMENT[status];
  return <Badge tone={t} dot>{l}</Badge>;
}

const APPROVAL: Record<Approval['status'], [string, Tone]> = {
  pending: ['Pending', 'sun'], approved: ['Approved', 'ok'], rejected: ['Rejected', 'bad'], superseded: ['Superseded', 'neutral'],
};
export function ApprovalStatusBadge({ status }: { status: Approval['status'] }) {
  const [l, t] = APPROVAL[status];
  return <Badge tone={t} dot>{l}</Badge>;
}

const RUN: Record<RunStatus, [string, Tone]> = {
  planning: ['Planning', 'cobalt'], running: ['Running', 'cobalt'], waiting_approval: ['Waiting for approval', 'sun'],
  completed: ['Completed', 'ok'], failed: ['Failed safely', 'bad'], stopped: ['Stopped', 'neutral'],
};
export function RunStatusBadge({ status }: { status: RunStatus }) {
  const [l, t] = RUN[status];
  return <Badge tone={t} dot>{l}</Badge>;
}

const NODE: Record<NodeStatus, Tone> = { pending: 'neutral', running: 'cobalt', done: 'ok', skipped: 'neutral', failed: 'bad', waiting: 'sun' };
export const nodeTone = (s: NodeStatus) => NODE[s];

const DOC: Record<DocumentItem['status'], [string, Tone]> = {
  processing: ['Processing', 'cobalt'], processed: ['Processed', 'ok'], needs_review: ['Needs review', 'sun'], failed: ['Failed', 'bad'],
};
export function DocStatusBadge({ status }: { status: DocumentItem['status'] }) {
  const [l, t] = DOC[status];
  return <Badge tone={t} dot>{l}</Badge>;
}

const AGENT_STATUS: Record<AgentStatus, [string, Tone]> = {
  idle: ['Idle', 'neutral'], running: ['Working', 'cobalt'], waiting: ['Waiting', 'sun'], completed: ['Done', 'ok'], error: ['Error', 'bad'],
};
export function AgentStatusBadge({ status }: { status: AgentStatus }) {
  const [l, t] = AGENT_STATUS[status];
  return <Badge tone={t} dot>{l}</Badge>;
}

export const DOC_TYPE_LABEL: Record<DocumentItem['type'], string> = {
  purchase_invoice: 'Purchase invoice', receipt: 'Receipt', business_photo: 'Business photo', eway_draft: 'E-way bill draft', working_paper: 'Working paper', other: 'Unclassified',
};

export type { AgentId };
