import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, BadgeCheck, CalendarClock, FileText, IndianRupee, Send, Sparkles, Truck, Upload } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useAppState } from '@/store/store';
import { Button, Card, CardHeader, StatCard, Badge } from '@/components/ui/primitives';
import { ActivityFeed } from '@/components/domain/ActivityFeed';
import { AgentAvatar } from '@/components/domain/AgentChip';
import { AGENTS, AGENT_ORDER } from '@/data/agents';
import { gstr3bSummary, periodOfIso } from '@/services/compliance';
import { previousPeriod } from '@/data/dates';
import { days, daysUntil, fmtDate, inr, periodLabel } from '@/lib/format';
import { inference, type IntentResult } from '@/services/inference';
import { cx } from '@/lib/util';

const SUGGESTIONS = ['Check my supplier invoices', 'Upload a purchase invoice', 'Prepare GSTR-3B', 'Dispatch goods to Kolhapur', 'What needs my approval?'];

export function Overview() {
  const s = useAppState();
  const P = previousPeriod();
  const sum = useMemo(() => gstr3bSummary(s, P), [s, P]);
  const pending = s.approvals.filter((a) => a.status === 'pending');
  const next = [...s.deadlines].filter((d) => d.status !== 'filed').sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];

  const chart = useMemo(() => s.monthly.map((m) => {
    const fromInvoices = s.invoices.filter((i) => periodOfIso(i.date) === m.period && !['duplicate', 'extraction_failed', 'processing'].includes(i.status)).reduce((a, i) => a + i.totals.taxable, 0);
    const [y, mo] = m.period.split('-').map(Number);
    return { month: new Date(y, mo - 1, 1).toLocaleDateString('en-IN', { month: 'short' }), Sales: m.outwardTaxable, Purchases: m.purchases || fromInvoices };
  }), [s.monthly, s.invoices]);

  const reconMix = useMemo(() => {
    const inv = s.invoices.filter((i) => periodOfIso(i.date) === P);
    const g = (pred: (st: string) => boolean) => inv.filter((i) => pred(i.status)).length;
    return [
      { name: 'Matched', value: g((x) => x === 'matched' || x === 'resolved'), color: '#1d7f52' },
      { name: 'Needs supplier action', value: g((x) => ['mismatch', 'missing_in_gst', 'followup_pending', 'followup_approved'].includes(x)), color: '#F9B318' },
      { name: 'Needs review', value: g((x) => x === 'extraction_failed' || x === 'duplicate'), color: '#c2362b' },
      { name: 'Processing', value: g((x) => x === 'processing'), color: '#1546D9' },
    ].filter((x) => x.value > 0);
  }, [s.invoices, P]);

  const attention = [
    ...s.invoices.filter((i) => ['mismatch', 'missing_in_gst', 'extraction_failed'].includes(i.status)).map((i) => ({ key: i.id, icon: FileText, title: `${i.number === 'Reading…' ? 'Invoice' : i.number} · ${i.supplierName}`, body: i.reconciliation?.explanation ?? 'Extraction needs a clearer copy.', to: `/invoices?open=${i.id}` })),
    ...s.shipments.filter((x) => x.status === 'blocked').map((x) => ({ key: x.id, icon: Truck, title: `${x.id} blocked · ${x.consignee}`, body: x.validation?.issues.filter((i) => i.severity === 'block').map((i) => i.message).join(' ') ?? '', to: `/dispatch?open=${x.id}` })),
    ...pending.map((a) => ({ key: a.id, icon: BadgeCheck, title: a.title, body: a.summary, to: `/approvals?focus=${a.id}` })),
  ];

  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="label-mono mb-2">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
          <h1 className="font-display text-3xl font-semibold tracking-tight md:text-[38px]">{greet}, {s.profile.ownerName.split(' ')[0]}.</h1>
          <p className="mt-2 max-w-xl text-sm text-ink-500">
            {pending.length ? `${pending.length} item${pending.length > 1 ? 's' : ''} need${pending.length > 1 ? '' : 's'} your decision. ` : 'Nothing needs your decision right now. '}
            Routine work is being handled by your agents.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/invoices?upload=1"><Button icon={<Upload className="size-4" />}>Upload invoice</Button></Link>
          <Link to="/compliance"><Button variant="secondary">GST readiness</Button></Link>
        </div>
      </div>

      <AskBox />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Awaiting your approval" value={pending.length} sub={pending[0]?.title ?? 'All clear'} tone={pending.length ? 'sun' : 'neutral'} icon={<BadgeCheck className="size-4" />} />
        <StatCard label={`ITC at risk · ${periodLabel(P)}`} value={inr(sum.itcAtRisk)} sub={sum.itcAtRisk ? 'Held until suppliers correct filings' : 'All ITC matched'} tone={sum.itcAtRisk ? 'bad' : 'neutral'} icon={<IndianRupee className="size-4" />} />
        <StatCard label="Next deadline" value={next ? `${next.form}` : '—'} sub={next ? `${fmtDate(next.dueDate)} · ${daysUntil(next.dueDate) >= 0 ? `in ${days(daysUntil(next.dueDate))}` : `${days(-daysUntil(next.dueDate))} overdue`}` : 'No open deadlines'} tone={next && daysUntil(next.dueDate) <= 3 ? 'bad' : 'cobalt'} icon={<CalendarClock className="size-4" />} />
        <StatCard label={`Purchase invoices · ${periodLabel(P)}`} value={sum.invoiceCount} sub={`Eligible ITC ${inr(sum.eligibleItc)}`} icon={<FileText className="size-4" />} />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Sales and purchases" subtitle="Taxable value, last 6 months (mock books + processed invoices)" />
          <div className="h-72 px-2 pt-4 pb-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} barGap={4}>
                <CartesianGrid vertical={false} stroke="#e3e1d8" />
                <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#7d7d87' }} />
                <YAxis tickLine={false} axisLine={false} width={56} tick={{ fontSize: 11, fill: '#7d7d87' }} tickFormatter={(v: number) => `₹${Math.round(v / 1000)}k`} />
                <Tooltip cursor={{ fill: '#f2f1ec' }} formatter={(v) => inr(Number(v))} contentStyle={{ borderRadius: 12, border: '1px solid #e3e1d8', fontSize: 12 }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Sales" fill="#1546D9" radius={[6, 6, 0, 0]} maxBarSize={28} />
                <Bar dataKey="Purchases" fill="#F9B318" radius={[6, 6, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <CardHeader title="Reconciliation" subtitle={`Purchase invoices · ${periodLabel(P)}`} action={<Link to="/reconciliation" className="text-xs font-medium text-cobalt hover:underline">Open</Link>} />
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={reconMix} dataKey="value" nameKey="name" innerRadius={52} outerRadius={78} paddingAngle={3} stroke="none">
                  {reconMix.map((x) => <Cell key={x.name} fill={x.color} />)}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e3e1d8', fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="space-y-1.5 px-5 pb-5 text-sm">
            {reconMix.map((x) => <li key={x.name} className="flex items-center gap-2"><span className="size-2.5 rounded-full" style={{ background: x.color }} /><span className="flex-1 text-ink-500">{x.name}</span><span className="font-semibold tabular-nums">{x.value}</span></li>)}
          </ul>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card>
          <CardHeader title="Needs attention" subtitle="Exceptions your agents could not close alone" />
          {attention.length === 0 ? <p className="px-5 py-8 text-center text-sm text-ink-400">Nothing needs attention.</p> : (
            <ul className="divide-y divide-beige-200">
              {attention.slice(0, 6).map((a) => (
                <li key={a.key}>
                  <Link to={a.to} className="flex gap-3 px-5 py-3 hover:bg-beige-50">
                    <a.icon className="mt-0.5 size-4 shrink-0 text-ink-400" />
                    <div className="min-w-0 flex-1"><p className="truncate text-[13px] font-medium">{a.title}</p><p className="line-clamp-2 text-xs text-ink-500">{a.body}</p></div>
                    <ArrowRight className="mt-0.5 size-4 shrink-0 text-ink-300" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Agents" subtitle="Live status" action={<Link to="/agents" className="text-xs font-medium text-cobalt hover:underline">Details</Link>} />
          <ul className="divide-y divide-beige-200">
            {AGENT_ORDER.map((id) => {
              const a = s.agents[id];
              return (
                <li key={id} className="flex items-center gap-3 px-5 py-2.5">
                  <AgentAvatar id={id} status={a.status} size="sm" />
                  <div className="min-w-0 flex-1"><p className="truncate text-[13px] font-medium">{AGENTS[id].name}</p><p className={cx('truncate text-xs', a.status === 'running' ? 'text-cobalt' : 'text-ink-400')}>{a.currentTask ?? 'Idle'}</p></div>
                  {a.status !== 'idle' && <Badge tone={a.status === 'running' ? 'cobalt' : a.status === 'waiting' ? 'sun' : a.status === 'error' ? 'bad' : 'ok'}>{a.status}</Badge>}
                </li>
              );
            })}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Recent activity" action={<Link to="/activity" className="text-xs font-medium text-cobalt hover:underline">All logs</Link>} />
          <ActivityFeed items={s.activity.slice(0, 7)} />
        </Card>
      </div>
    </div>
  );
}

function AskBox() {
  const nav = useNavigate();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState<(IntentResult & { q: string }) | null>(null);
  const ask = async (q: string) => {
    if (!q.trim() || busy) return;
    setBusy(true);
    setReply(null);
    try { const r = await inference.interpret(q); setReply({ ...r, q }); } finally { setBusy(false); setText(''); }
  };
  return (
    <Card className="overflow-hidden">
      <div className="bg-gradient-to-br from-cobalt to-cobalt-800 p-5 text-white md:p-6">
        <div className="flex items-center gap-2 text-sm font-medium text-white/80"><Sparkles className="size-4 text-sun" /> Ask YUKTIDOOT</div>
        <form onSubmit={(e) => { e.preventDefault(); void ask(text); }} className="mt-3 flex gap-2">
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Tell me what you need done…" aria-label="Instruction for YUKTIDOOT" className="h-12 min-w-0 flex-1 rounded-xl border-0 bg-white/12 px-4 text-[15px] text-white placeholder:text-white/50 focus:bg-white/18 focus:ring-2 focus:ring-sun focus:outline-none" />
          <Button type="submit" variant="sun" size="lg" loading={busy} icon={<Send className="size-4" />} aria-label="Send">
            <span className="hidden sm:inline">Ask</span>
          </Button>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">
          {SUGGESTIONS.map((x) => <button key={x} onClick={() => void ask(x)} className="rounded-full bg-white/10 px-3 py-1 text-xs text-white/85 hover:bg-white/20">{x}</button>)}
        </div>
      </div>
      {(busy || reply) && (
        <div className="flex flex-col gap-3 border-t border-beige-200 bg-white px-5 py-4 sm:flex-row sm:items-center">
          <AgentAvatar id="core" status={busy ? 'running' : 'idle'} size="sm" />
          <div className="min-w-0 flex-1 text-sm">
            {busy ? <span className="text-ink-400">Understanding your request…</span> : reply && (<>
              <p className="text-xs text-ink-400">“{reply.q}”</p>
              <p className="mt-0.5 text-ink-700">{reply.reply}</p>
            </>)}
          </div>
          {reply?.route && <Button size="sm" onClick={() => nav(reply.route!)} icon={<ArrowRight className="size-3.5" />}>Go</Button>}
        </div>
      )}
      <p className="border-t border-beige-200 bg-beige-50 px-5 py-2 text-[11px] text-ink-400">Demo mode: requests are interpreted by a local keyword-based mock, not a language model.</p>
    </Card>
  );
}
