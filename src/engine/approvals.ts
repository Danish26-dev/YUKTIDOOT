import type { Approval } from '@/types';
import { store, log } from '@/store/store';
import { toast } from '@/store/toast';
import { hashPayload, nowIso, uid } from '@/lib/util';
import { currentPayload } from '@/services/payloads';

type ApprovalInput = Pick<Approval, 'kind' | 'title' | 'summary' | 'refId' | 'requestedBy' | 'workflowRunId' | 'verificationPassed'>;

/** Create an approval bound to the SHA-256 of the current canonical payload. */
export async function requestApproval(input: ApprovalInput): Promise<string> {
  const payload = currentPayload(store.get(), input);
  if (!payload) throw new Error(`Cannot request approval: ${input.refId} not found`);
  const payloadHash = await hashPayload(payload);
  const prev = store.get().approvals.filter((a) => a.refId === input.refId && a.kind === input.kind);
  const id = uid('apr');
  store.update((d) => {
    d.approvals.unshift({ ...input, id, payload, payloadHash, version: prev.length + 1, status: 'pending', createdAt: nowIso() });
  });
  log('core', 'approval', `Approval requested: ${input.title}`, id);
  toast('info', 'Approval needed', input.title, { label: 'Review', to: `/approvals?focus=${id}` });
  return id;
}

/** Mark every pending approval for this object as superseded (its payload changed). */
export function supersedeApprovals(kind: Approval['kind'], refId: string, reason: string) {
  const pending = store.get().approvals.filter((a) => a.kind === kind && a.refId === refId && a.status === 'pending');
  if (!pending.length) return 0;
  store.update((d) => {
    for (const a of d.approvals) if (a.kind === kind && a.refId === refId && a.status === 'pending') {
      a.status = 'superseded';
      a.decidedAt = nowIso();
      a.decisionNote = reason;
    }
  });
  log('core', 'warning', `Approval superseded for ${refId}: ${reason}`, refId);
  return pending.length;
}

/** True when the approval still describes exactly the current data. */
export async function approvalIsCurrent(a: Approval) {
  const payload = currentPayload(store.get(), a);
  if (!payload) return false;
  return (await hashPayload(payload)) === a.payloadHash;
}
