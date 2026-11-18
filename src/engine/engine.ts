// Local workflow executor: the frontend stand-in for Google ADK orchestration.
// It walks the Workflow Builder's graph, runs one approved handler per node,
// follows decision branches, pauses at approval checkpoints and fails safely.
import type { AgentId, NodeKind, WorkflowRun, WorkflowTemplate } from '@/types';
import { store, log, setAgent } from '@/store/store';
import { toast } from '@/store/toast';
import { nowIso, sleep, uid } from '@/lib/util';
import { buildWorkflow, validateGraph, type BuildContext } from '@/services/workflowBuilder';
import { HANDLERS, REGISTRY } from './handlers';

const STEP_MS: Record<NodeKind, number> = { task: 900, decision: 700, approval: 500, end: 400 };
let speed = 1;
export const setEngineSpeed = (s: number) => { speed = s; };

const getRun = (id: string) => store.get().runs.find((r) => r.id === id);

function patchNode(runId: string, nodeId: string, patch: Partial<WorkflowRun['nodes'][number]>) {
  store.update((d) => {
    const n = d.runs.find((r) => r.id === runId)?.nodes.find((x) => x.id === nodeId);
    if (n) Object.assign(n, patch);
  });
}

function finish(runId: string, status: WorkflowRun['status'], reason?: string) {
  store.update((d) => {
    const r = d.runs.find((x) => x.id === runId);
    if (!r) return;
    r.status = status;
    r.finishedAt = nowIso();
    r.failureReason = reason;
    r.waitingNodeId = undefined;
    for (const n of r.nodes) if (n.status === 'pending') { n.status = 'skipped'; n.detail ??= 'Branch not taken'; }
  });
  const involved = new Set<AgentId>((getRun(runId)?.nodes ?? []).map((n) => n.agent));
  for (const a of involved) if (store.get().agents[a].status !== 'waiting') setAgent(a, 'idle');
  if (!store.get().runs.some((r) => r.status === 'running' || r.status === 'waiting_approval')) setAgent('core', 'idle');
}

/** Build, validate and start a workflow. Returns the run id. */
export async function startWorkflow(template: WorkflowTemplate, refId: string, ctx: BuildContext, runId = uid('run')): Promise<string> {
  const built = buildWorkflow(template, ctx);
  setAgent('core', 'running', `Interpreting objective: ${built.objective}`);
  setAgent('builder', 'running', `Planning: ${built.objective}`);
  store.update((d) => {
    d.runs.unshift({ id: runId, template, objective: built.objective, refId, status: 'planning', nodes: built.nodes, edges: built.edges, createdAt: nowIso() });
  });
  log('core', 'info', `Objective received: ${built.objective}`, runId);
  await sleep(1300 / speed);

  const errors = validateGraph(built.nodes, built.edges, REGISTRY);
  if (errors.length) {
    setAgent('builder', 'error', 'Graph validation failed');
    log('builder', 'error', `Workflow rejected by validation: ${errors.join('; ')}`, runId);
    finish(runId, 'failed', errors.join('; '));
    return runId;
  }
  setAgent('builder', 'idle', undefined, 1);
  log('builder', 'success', `Workflow generated: ${built.nodes.length} nodes, ${built.edges.filter((e) => e.label).length} conditional branches. ${built.notes[1] ?? ''}`, runId);
  store.update((d) => { const r = d.runs.find((x) => x.id === runId); if (r) r.status = 'running'; });
  void execute(runId, built.nodes[0].id);
  return runId;
}

async function execute(runId: string, startId: string | undefined) {
  let id = startId;
  while (id) {
    const run = getRun(runId);
    if (!run || run.status !== 'running') return;
    const node = run.nodes.find((n) => n.id === id)!;
    patchNode(runId, node.id, { status: 'running', startedAt: nowIso() });
    setAgent(node.agent, 'running', node.label);
    setAgent('core', 'running', `Coordinating: ${run.objective}`);
    await sleep(STEP_MS[node.kind] / speed);

    let res: Awaited<ReturnType<(typeof HANDLERS)[string]>>;
    try {
      const h = HANDLERS[node.handler];
      if (!h) throw new Error(`Handler "${node.handler}" is not in the approved registry`);
      res = await h({ runId, refId: run.refId });
    } catch (e) {
      res = { fail: e instanceof Error ? e.message : String(e) };
    }

    if (res.fail) {
      patchNode(runId, node.id, { status: 'failed', detail: res.fail, endedAt: nowIso() });
      setAgent(node.agent, 'error', res.fail);
      log(node.agent, 'error', res.fail, run.refId);
      toast('error', `${node.label} failed`, res.fail, { label: 'View workflow', to: `/workflows?run=${runId}` });
      finish(runId, 'failed', res.fail);
      setTimeout(() => { if (store.get().agents[node.agent].status === 'error') setAgent(node.agent, 'idle'); }, 6000);
      return;
    }
    if (res.awaitApproval) {
      patchNode(runId, node.id, { status: 'waiting', detail: res.detail });
      store.update((d) => { const r = d.runs.find((x) => x.id === runId); if (r) { r.status = 'waiting_approval'; r.waitingNodeId = node.id; } });
      setAgent('core', 'waiting', 'Awaiting owner approval');
      for (const a of new Set(run.nodes.map((n) => n.agent))) if (a !== 'core') setAgent(a, 'idle');
      return;
    }
    patchNode(runId, node.id, { status: 'done', detail: res.detail, endedAt: nowIso() });
    setAgent(node.agent, 'idle', undefined, 1);
    if (res.stop) {
      finish(runId, 'stopped', res.stop);
      return;
    }
    const outs = run.edges.filter((e) => e.from === id);
    const next = res.branch ? outs.find((e) => e.label === res.branch) : outs[0];
    if (res.branch && !next) {
      finish(runId, 'failed', `No branch "${res.branch}" from ${node.label}`);
      return;
    }
    id = next?.to;
  }
  finish(runId, 'completed');
}

/** Continue a run paused at an approval checkpoint. */
export async function resumeAfterDecision(runId: string, approved: boolean, note: string) {
  const run = getRun(runId);
  if (!run || run.status !== 'waiting_approval' || !run.waitingNodeId) return;
  const nodeId = run.waitingNodeId;
  if (!approved) {
    patchNode(runId, nodeId, { status: 'failed', detail: note || 'Rejected by owner', endedAt: nowIso() });
    finish(runId, 'stopped', 'Rejected by owner');
    return;
  }
  patchNode(runId, nodeId, { status: 'done', detail: note || 'Approved by owner', endedAt: nowIso() });
  store.update((d) => { const r = d.runs.find((x) => x.id === runId); if (r) { r.status = 'running'; r.waitingNodeId = undefined; } });
  const next = run.edges.find((e) => e.from === nodeId)?.to;
  await execute(runId, next);
}

/** Stop a run that is waiting (e.g. its data changed after approval was requested). */
export function stopRun(runId: string, reason: string) {
  const run = getRun(runId);
  if (!run || run.status === 'completed' || run.status === 'failed' || run.status === 'stopped') return;
  if (run.waitingNodeId) patchNode(runId, run.waitingNodeId, { status: 'failed', detail: reason, endedAt: nowIso() });
  finish(runId, 'stopped', reason);
}
