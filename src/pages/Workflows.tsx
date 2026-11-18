import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { GitBranch, Lightbulb, Plus } from 'lucide-react';
import type { WorkflowRun, WorkflowTemplate } from '@/types';
import { store, useAppState } from '@/store/store';
import { prepareGstr3b, uploadSampleInvoice, validateDispatch } from '@/store/actions';
import { Badge, Button, Card, CardHeader, EmptyState, Field, PageHeader, Select, Tabs } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/overlays';
import { WorkflowGraph } from '@/components/domain/WorkflowGraph';
import { RunStatusBadge } from '@/components/domain/status';
import { AgentAvatar } from '@/components/domain/AgentChip';
import { AGENTS } from '@/data/agents';
import { SAMPLE_INVOICES, type SampleInvoice } from '@/data/samples';
import { buildWorkflow, TEMPLATE_LABEL } from '@/services/workflowBuilder';
import { previousPeriod } from '@/data/dates';
import { fmtDateTime, fmtTime, periodLabel, relTime } from '@/lib/format';
import { useQueryParam } from '@/lib/useQueryParam';
import { cx } from '@/lib/util';

type Filter = 'all' | 'live' | 'done';

export function WorkflowsPage() {
  const s = useAppState();
  const [runId, setRunId] = useQueryParam('run');
  const [filter, setFilter] = useState<Filter>('all');
  const [creating, setCreating] = useState(false);
  const [node, setNode] = useState<string | undefined>();
  const runs = useMemo(() => s.runs.filter((r) => filter === 'all' ? true : filter === 'live' ? ['planning', 'running', 'waiting_approval'].includes(r.status) : !['planning', 'running', 'waiting_approval'].includes(r.status)), [s.runs, filter]);
  const run = s.runs.find((r) => r.id === runId) ?? s.runs[0];
  useEffect(() => setNode(undefined), [run?.id]);
  const sel = run?.nodes.find((n) => n.id === node);

  return (
    <div>
      <PageHeader eyebrow="Workflow Builder · execution" title="Workflow Center" description="Each objective gets its own validated execution graph built by the Workflow Builder. It is not a hardcoded pipeline and not generated code: every node maps to an approved tool."
        actions={<Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>New workflow</Button>} />

      <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
        <Card className="h-fit">
          <div className="border-b border-beige-200 p-3"><Tabs value={filter} onChange={setFilter} items={[{ value: 'all', label: 'All', count: s.runs.length }, { value: 'live', label: 'Live' }, { value: 'done', label: 'Finished' }]} /></div>
          {runs.length === 0 ? <EmptyState icon={<GitBranch className="size-5" />} title="No workflows" body="Start one with New workflow." /> : (
            <ul className="max-h-[640px] divide-y divide-beige-200 overflow-y-auto">
              {runs.map((r) => (
                <li key={r.id}>
                  <button onClick={() => setRunId(r.id)} className={cx('w-full px-4 py-3 text-left hover:bg-beige-50', run?.id === r.id && 'bg-cobalt-50/60')}>
                    <div className="flex items-center justify-between gap-2"><span className="font-mono text-[10px] tracking-wider text-ink-400 uppercase">{TEMPLATE_LABEL[r.template]}</span><RunStatusBadge status={r.status} /></div>
                    <p className="mt-1 line-clamp-2 text-[13px] font-medium">{r.objective}</p>
                    <p className="mt-0.5 text-[11px] text-ink-400">{r.refId} · {relTime(r.createdAt)}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {run ? (
          <div className="min-w-0 space-y-6">
            <Card>
              <CardHeader title={run.objective} subtitle={<span className="flex flex-wrap items-center gap-2"><RunStatusBadge status={run.status} />Started {fmtDateTime(run.createdAt)}{run.finishedAt && ` · finished ${fmtTime(run.finishedAt)}`}</span>}
                action={<RefLink run={run} />} />
              <div className="p-4">
                <WorkflowGraph run={run} onSelect={setNode} selected={node} />
                <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-ink-500">
                  {[['bg-ok', 'Done'], ['bg-cobalt', 'Running'], ['bg-sun', 'Waiting for approval'], ['bg-bad', 'Failed'], ['bg-beige-300', 'Not taken']].map(([c, l]) => <span key={l} className="flex items-center gap-1.5"><span className={cx('size-2 rounded-full', c)} />{l}</span>)}
                  <span className="ml-auto">Click a node for details</span>
                </div>
                {run.failureReason && <p className={cx('mt-3 rounded-xl px-3 py-2 text-sm', run.status === 'failed' ? 'bg-bad-50 text-bad' : 'bg-beige-100 text-ink-700')}>{run.failureReason}</p>}
              </div>
            </Card>
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader title={sel ? sel.label : 'Step details'} subtitle={sel ? `${AGENTS[sel.agent].name} · ${sel.kind}` : 'Select a node in the graph'} />
                {sel ? (
                  <div className="space-y-3 p-5 text-sm">
                    <div className="flex items-center gap-2"><AgentAvatar id={sel.agent} size="sm" /><Badge tone={sel.status === 'done' ? 'ok' : sel.status === 'failed' ? 'bad' : sel.status === 'waiting' ? 'sun' : sel.status === 'running' ? 'cobalt' : 'neutral'}>{sel.status}</Badge><span className="font-mono text-[11px] text-ink-400">tool: {sel.handler}</span></div>
                    <div><p className="text-xs font-medium text-ink-500">Why the Workflow Builder added this step</p><p>{sel.rationale}</p></div>
                    {sel.detail && <div><p className="text-xs font-medium text-ink-500">Result</p><p className={sel.status === 'failed' ? 'text-bad' : ''}>{sel.detail}</p></div>}
                    {sel.startedAt && <p className="font-mono text-[11px] text-ink-400">{fmtTime(sel.startedAt)}{sel.endedAt ? ` → ${fmtTime(sel.endedAt)}` : ''}</p>}
                  </div>
                ) : <p className="px-5 py-8 text-center text-sm text-ink-400">Every node shows which agent ran it, which approved tool it used and why it was planned.</p>}
              </Card>
              <Card>
                <CardHeader title="Plan summary" subtitle="Graph properties" />
                <ul className="space-y-2 p-5 text-sm">
                  <li className="flex justify-between"><span className="text-ink-500">Nodes</span><span className="font-medium">{run.nodes.length}</span></li>
                  <li className="flex justify-between"><span className="text-ink-500">Conditional branches</span><span className="font-medium">{run.edges.filter((e) => e.label).length}</span></li>
                  <li className="flex justify-between"><span className="text-ink-500">Human approval checkpoints</span><span className="font-medium">{run.nodes.filter((n) => n.kind === 'approval').length}</span></li>
                  <li className="flex justify-between"><span className="text-ink-500">Independent verification steps</span><span className="font-medium">{run.nodes.filter((n) => n.agent === 'verification').length}</span></li>
                  <li className="flex justify-between"><span className="text-ink-500">Agents involved</span><span className="font-medium">{new Set(run.nodes.map((n) => n.agent)).size}</span></li>
                  <li className="flex justify-between"><span className="text-ink-500">Steps executed</span><span className="font-medium">{run.nodes.filter((n) => n.status === 'done').length}</span></li>
                </ul>
              </Card>
            </div>
          </div>
        ) : <Card><EmptyState icon={<GitBranch className="size-5" />} title="No workflow selected" /></Card>}
      </div>
      {creating && <NewWorkflow onClose={() => setCreating(false)} onStarted={(id) => { setCreating(false); if (id) setRunId(id); }} />}
    </div>
  );
}

function RefLink({ run }: { run: WorkflowRun }) {
  const to = run.template === 'purchase_invoice' ? `/invoices?open=${run.refId}` : run.template === 'dispatch_check' ? `/dispatch?open=${run.refId}` : '/compliance';
  return <Link to={to}><Button size="sm" variant="secondary">Open {run.template === 'purchase_invoice' ? 'invoice' : run.template === 'dispatch_check' ? 'shipment' : 'compliance'}</Button></Link>;
}

function NewWorkflow({ onClose, onStarted }: { onClose: () => void; onStarted: (runId?: string) => void }) {
  const s = useAppState();
  const [tpl, setTpl] = useState<WorkflowTemplate>('purchase_invoice');
  const [sample, setSample] = useState<SampleInvoice['key']>('ganesh_mismatch');
  const openShipments = s.shipments.filter((x) => !['eway_generated', 'awaiting_approval'].includes(x.status));
  const [ship, setShip] = useState(openShipments[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const P = previousPeriod();
  const preview = useMemo(() => buildWorkflow(tpl, { profile: s.profile, shipment: s.shipments.find((x) => x.id === ship), period: P }), [tpl, s.profile, s.shipments, ship, P]);

  const start = async () => {
    setBusy(true);
    try {
      if (tpl === 'purchase_invoice') {
        const inv = await uploadSampleInvoice(sample);
        onStarted(inv ? store.get().invoices.find((i) => i.id === inv)?.workflowRunId : undefined);
      } else if (tpl === 'dispatch_check') {
        await validateDispatch(ship);
        onStarted(latestRun('dispatch_check'));
      } else {
        await prepareGstr3b(P);
        onStarted(latestRun('gst_readiness'));
      }
    } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} size="xl" title="New workflow" subtitle="State an objective. The Workflow Builder plans the graph from your business context; preview it below before running."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy} disabled={tpl === 'dispatch_check' && !ship} onClick={() => void start()}>Build & run</Button></>}>
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Objective" htmlFor="nw-t"><Select id="nw-t" value={tpl} onChange={(e) => setTpl(e.target.value as WorkflowTemplate)}>{(Object.keys(TEMPLATE_LABEL) as WorkflowTemplate[]).map((k) => <option key={k} value={k}>{TEMPLATE_LABEL[k]}</option>)}</Select></Field>
        {tpl === 'purchase_invoice' && <Field label="Invoice" htmlFor="nw-s"><Select id="nw-s" value={sample} onChange={(e) => setSample(e.target.value as SampleInvoice['key'])}>{SAMPLE_INVOICES.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</Select></Field>}
        {tpl === 'dispatch_check' && <Field label="Shipment" htmlFor="nw-sh" error={!openShipments.length ? 'No open shipments' : undefined}><Select id="nw-sh" value={ship} onChange={(e) => setShip(e.target.value)}>{openShipments.map((x) => <option key={x.id} value={x.id}>{x.id} · {x.consignee}</option>)}</Select></Field>}
        {tpl === 'gst_readiness' && <Field label="Period"><div className="input bg-beige-50">{periodLabel(P)}</div></Field>}
        <Field label="Business context"><div className="input bg-beige-50 truncate">{s.profile.registrationType === 'regular' ? 'Regular GST registrant' : 'Composition scheme'}</div></Field>
      </div>
      <div className="mt-5 rounded-2xl bg-sun-50 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold"><Lightbulb className="size-4 text-sun-700" /> Why this plan</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[13px] text-ink-700">{preview.notes.map((n) => <li key={n}>{n}</li>)}</ul>
        {tpl === 'purchase_invoice' && <p className="mt-2 text-xs text-ink-500">Try switching the registration type on the Business Profile page to composition and the graph changes: ITC matching is left out.</p>}
      </div>
      <div className="mt-5"><p className="label-mono mb-2">Preview · {preview.nodes.length} nodes</p><WorkflowGraph run={{ nodes: preview.nodes, edges: preview.edges, status: 'planning' }} /></div>
    </Modal>
  );
}

/** Most recent run of a template, read from the store after an action has started it. */
const latestRun = (t: WorkflowTemplate) => store.get().runs.find((r) => r.template === t)?.id;
