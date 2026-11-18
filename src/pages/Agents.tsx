import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Cpu, KeyRound, Wrench } from 'lucide-react';
import type { AgentId } from '@/types';
import { useAppState } from '@/store/store';
import { AGENTS, AGENT_ORDER } from '@/data/agents';
import { Badge, Button, Card, CardHeader, PageHeader } from '@/components/ui/primitives';
import { Drawer } from '@/components/ui/overlays';
import { AgentAvatar } from '@/components/domain/AgentChip';
import { AgentStatusBadge } from '@/components/domain/status';
import { ActivityFeed } from '@/components/domain/ActivityFeed';
import { inferenceStatus } from '@/services/inference';
import { relTime } from '@/lib/format';
import { cx } from '@/lib/util';

export function AgentsPage() {
  const s = useAppState();
  const [open, setOpen] = useState<AgentId | null>(null);
  const specialists = AGENT_ORDER.filter((id) => AGENTS[id].role === 'specialist');
  const live = s.runs.filter((r) => ['planning', 'running', 'waiting_approval'].includes(r.status));

  return (
    <div>
      <PageHeader eyebrow="Multi-agent system" title="AI agents" description="One master agent, a separate Workflow Builder and five specialists. Business understanding is a shared capability of YUKTIDOOT Core, not an agent of its own." />

      <Card className="mb-6 overflow-hidden">
        <div className="relative p-6 md:p-8">
          <div className="mx-auto grid max-w-4xl gap-5">
            <div className="flex justify-center"><AgentNode id="builder" onOpen={setOpen} big /></div>
            <div className="flex justify-center"><svg width="2" height="28" aria-hidden><line x1="1" y1="0" x2="1" y2="28" stroke="#F9B318" strokeWidth="2" strokeDasharray="4 4" className={cx(s.agents.builder.status === 'running' && 'animate-flow')} /></svg></div>
            <div className="flex justify-center"><AgentNode id="core" onOpen={setOpen} big /></div>
            <div className="relative h-8" aria-hidden>
              <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 10">
                {specialists.map((_, i) => <line key={i} x1="50" y1="0" x2={10 + i * 20} y2="10" stroke="#1546D9" strokeOpacity=".35" strokeWidth=".4" vectorEffect="non-scaling-stroke" />)}
              </svg>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">{specialists.map((id) => <AgentNode key={id} id={id} onOpen={setOpen} />)}</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-beige-200 bg-beige-50 px-5 py-3 text-xs text-ink-500">
          <span className="font-medium text-ink">{live.length ? `${live.length} workflow(s) live` : 'No workflows running'}</span>
          {live.map((r) => <Link key={r.id} to={`/workflows?run=${r.id}`} className="rounded-full bg-white px-2.5 py-0.5 ring-1 ring-beige-300 hover:ring-cobalt">{r.objective}</Link>)}
          {!live.length && <Link to="/invoices?upload=1" className="font-medium text-cobalt hover:underline">Start one by uploading an invoice →</Link>}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Inference layer" subtitle="Where AI reasoning runs" />
          <div className="space-y-3 p-5 text-sm">
            <div className="flex items-start gap-3 rounded-2xl bg-sun-50 p-4"><Cpu className="mt-0.5 size-5 shrink-0 text-sun-700" /><div><p className="font-semibold">Active: local mock provider</p><p className="text-ink-500">Photo understanding, extraction and intent interpretation are simulated in the browser.</p></div></div>
            <div className="flex items-start gap-3 rounded-2xl bg-beige-100 p-4"><KeyRound className="mt-0.5 size-5 shrink-0 text-ink-400" /><div><p className="font-semibold">Planned: 0G Private Computer</p><p className="text-ink-500">Private inference layer for sensitive business context. Not connected in this prototype; there is no 0G client in the code.</p></div></div>
            <p className="font-mono text-[11px] text-ink-400">{inferenceStatus.message}</p>
          </div>
        </Card>
        <Card>
          <CardHeader title="Division of labour" />
          <ul className="space-y-3 p-5 text-sm text-ink-700">
            <li><b>AI-shaped steps</b> (simulated): reading documents and photos, interpreting requests.</li>
            <li><b>Deterministic services</b> (implemented): GST arithmetic, reconciliation rules, GSTIN checksum, e-way bill rules, duplicate detection.</li>
            <li><b>Verification Agent</b>: recomputes from source data and never reuses another agent’s totals.</li>
            <li><b>Owner</b>: approves anything external, statutory or irreversible, bound to the exact payload.</li>
          </ul>
        </Card>
      </div>
      {open && <AgentDrawer id={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function AgentNode({ id, onOpen, big }: { id: AgentId; onOpen: (id: AgentId) => void; big?: boolean }) {
  const s = useAppState();
  const a = s.agents[id];
  const m = AGENTS[id];
  return (
    <button onClick={() => onOpen(id)} data-agent={id} className={cx('w-full rounded-2xl border bg-white p-4 text-left shadow-card transition hover:-translate-y-0.5 hover:border-cobalt/40', big ? 'max-w-md' : 'border-beige-200', big && id === 'core' ? 'border-cobalt/30' : big ? 'border-sun/50' : '', a.status === 'running' && 'border-cobalt ring-4 ring-cobalt/10', a.status === 'waiting' && 'border-sun ring-4 ring-sun/20', a.status === 'error' && 'border-bad')}>
      <div className="flex items-center gap-3">
        <AgentAvatar id={id} status={a.status} size={big ? 'lg' : 'md'} />
        <div className="min-w-0 flex-1">
          <p className={cx('font-semibold leading-tight', big ? 'truncate text-base' : 'truncate text-[13px]')} title={m.name}>{big || id === 'verification' ? m.name : `${m.short} Agent`}</p>
          <p className="font-mono text-[10px] tracking-wider text-ink-400 uppercase">{m.role === 'master' ? 'Master agent' : m.role === 'planner' ? 'Planning agent' : 'Specialist'}</p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2"><AgentStatusBadge status={a.status} /><span className="text-[11px] text-ink-400 tabular-nums">{a.tasksCompleted} tasks</span></div>
      <p className={cx('mt-2 line-clamp-2 min-h-8 text-xs', a.status === 'running' ? 'text-cobalt' : 'text-ink-500')}>{a.currentTask ?? (a.lastActive ? `Last active ${relTime(a.lastActive)}` : 'Idle')}</p>
    </button>
  );
}

function AgentDrawer({ id, onClose }: { id: AgentId; onClose: () => void }) {
  const s = useAppState();
  const m = AGENTS[id];
  const a = s.agents[id];
  const recentNodes = s.runs.flatMap((r) => r.nodes.filter((n) => n.agent === id && n.status !== 'pending' && n.status !== 'skipped').map((n) => ({ n, r }))).sort((x, y) => (y.n.startedAt ?? '').localeCompare(x.n.startedAt ?? '')).slice(0, 8);
  return (
    <Drawer open onClose={onClose} title={m.name} subtitle={<span className="flex items-center gap-2"><AgentStatusBadge status={a.status} />{a.currentTask}</span>} footer={<Button variant="secondary" onClick={onClose}>Close</Button>}>
      <div className="space-y-6">
        <p className="text-sm text-ink-700">{m.description}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="p-4"><p className="mb-2 text-xs font-semibold text-ink-500">Responsibilities</p><ul className="list-disc space-y-1 pl-4 text-sm">{m.responsibilities.map((r) => <li key={r}>{r}</li>)}</ul></Card>
          <Card className="p-4"><p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-ink-500"><Wrench className="size-3.5" /> Approved tools</p><div className="flex flex-wrap gap-1.5">{m.tools.map((t) => <Badge key={t} tone="cobalt"><span className="font-mono">{t}</span></Badge>)}</div><p className="mt-2 text-[11px] text-ink-400">Agents can only call tools in this registry.</p></Card>
        </div>
        <Card>
          <CardHeader title="Recent steps" subtitle="From workflow runs" />
          {recentNodes.length ? (
            <ul className="divide-y divide-beige-200">{recentNodes.map(({ n, r }) => (
              <li key={r.id + n.id}><Link to={`/workflows?run=${r.id}`} className="block px-5 py-3 hover:bg-beige-50"><div className="flex items-center justify-between gap-2"><span className="text-sm font-medium">{n.label}</span><Badge tone={n.status === 'done' ? 'ok' : n.status === 'failed' ? 'bad' : n.status === 'waiting' ? 'sun' : 'cobalt'}>{n.status}</Badge></div><p className="truncate text-xs text-ink-500">{n.detail ?? r.objective}</p></Link></li>
            ))}</ul>
          ) : <p className="px-5 py-6 text-center text-sm text-ink-400">No steps yet.</p>}
        </Card>
        <Card><CardHeader title="Activity" /><ActivityFeed items={s.activity.filter((x) => x.agent === id).slice(0, 15)} empty="No activity logged for this agent yet." /></Card>
      </div>
    </Drawer>
  );
}
