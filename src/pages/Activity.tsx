import { useMemo, useState } from 'react';
import { Download, ListFilter, Search } from 'lucide-react';
import type { ActivityEntry } from '@/types';
import { useAppState } from '@/store/store';
import { AGENTS, AGENT_ORDER } from '@/data/agents';
import { Badge, Button, Card, EmptyState, Input, PageHeader, Select, type Tone } from '@/components/ui/primitives';
import { AgentAvatar, AgentName } from '@/components/domain/AgentChip';
import { fmtDateTime } from '@/lib/format';
import { downloadText, toCsv } from '@/lib/util';

const LEVEL: Record<ActivityEntry['level'], Tone> = { info: 'neutral', success: 'ok', warning: 'sun', error: 'bad', approval: 'cobalt' };

export function ActivityPage() {
  const s = useAppState();
  const [agent, setAgent] = useState('');
  const [level, setLevel] = useState('');
  const [q, setQ] = useState('');
  const rows = useMemo(() => s.activity.filter((a) => (!agent || a.agent === agent) && (!level || a.level === level) && (!q || `${a.message} ${a.refId ?? ''}`.toLowerCase().includes(q.toLowerCase()))), [s.activity, agent, level, q]);
  const filtered = agent || level || q;

  const exportCsv = () => downloadText(`yuktidoot-activity-${new Date().toISOString().slice(0, 10)}.csv`,
    toCsv([['Time', 'Actor', 'Level', 'Message', 'Reference'], ...rows.map((a) => [a.at, a.agent === 'owner' ? 'Owner' : AGENTS[a.agent].name, a.level, a.message, a.refId ?? ''])]), 'text/csv');

  return (
    <div>
      <PageHeader eyebrow="Audit trail" title="Activity logs" description="Every action by every agent and by you, in order. Approvals record the payload hash they were bound to."
        actions={<Button variant="secondary" icon={<Download className="size-4" />} onClick={exportCsv} disabled={!rows.length}>Export CSV</Button>} />
      <Card>
        <div className="flex flex-col gap-2 border-b border-beige-200 p-4 md:flex-row md:items-center">
          <div className="relative md:flex-1"><Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-300" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search messages or references" className="pl-9" aria-label="Search activity" /></div>
          <Select value={agent} onChange={(e) => setAgent(e.target.value)} className="md:w-60" aria-label="Filter by actor"><option value="">All actors</option><option value="owner">Owner</option>{AGENT_ORDER.map((id) => <option key={id} value={id}>{AGENTS[id].name}</option>)}</Select>
          <Select value={level} onChange={(e) => setLevel(e.target.value)} className="md:w-44" aria-label="Filter by level"><option value="">All levels</option>{Object.keys(LEVEL).map((l) => <option key={l} value={l}>{l}</option>)}</Select>
          {filtered && <Button variant="ghost" onClick={() => { setAgent(''); setLevel(''); setQ(''); }}>Clear</Button>}
        </div>
        {rows.length === 0 ? <EmptyState icon={<ListFilter className="size-5" />} title="No log entries match" body="Try a different filter." /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="text-left text-xs text-ink-400"><tr className="border-b border-beige-200"><th className="px-4 py-3 font-medium">Time</th><th className="px-4 py-3 font-medium">Actor</th><th className="px-4 py-3 font-medium">Level</th><th className="px-4 py-3 font-medium">Event</th><th className="px-4 py-3 font-medium">Reference</th></tr></thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id} className="border-b border-beige-200 last:border-0 align-top">
                    <td className="px-4 py-3 font-mono text-[12px] whitespace-nowrap text-ink-500">{fmtDateTime(a.at)}</td>
                    <td className="px-4 py-3"><span className="flex items-center gap-2 whitespace-nowrap"><AgentAvatar id={a.agent} size="sm" /><AgentName id={a.agent} /></span></td>
                    <td className="px-4 py-3"><Badge tone={LEVEL[a.level]}>{a.level}</Badge></td>
                    <td className="px-4 py-3 text-ink-700">{a.message}</td>
                    <td className="px-4 py-3 font-mono text-[11px] text-ink-400">{a.refId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="border-t border-beige-200 px-4 py-2.5 text-xs text-ink-400">{rows.length} of {s.activity.length} entries · stored in this browser (localStorage)</p>
      </Card>
    </div>
  );
}
