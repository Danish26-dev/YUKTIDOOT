import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BadgeCheck, Fingerprint, Mail, PencilLine, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { Approval } from '@/types';
import { useAppState } from '@/store/store';
import { approve, reject } from '@/store/actions';
import { Badge, Button, Card, EmptyState, Input, PageHeader, Tabs } from '@/components/ui/primitives';
import { EditFollowUpModal } from '@/components/domain/EditFollowUpModal';
import { ApprovalStatusBadge } from '@/components/domain/status';
import { AgentAvatar } from '@/components/domain/AgentChip';
import { AGENTS } from '@/data/agents';
import { fmtDateTime, inr, relTime } from '@/lib/format';
import { cx, shortHash } from '@/lib/util';
import { useQueryParam } from '@/lib/useQueryParam';

type Tab = 'pending' | 'decided' | 'all';
const KIND: Record<Approval['kind'], string> = { supplier_followup: 'Supplier follow-up', eway_bill: 'E-way bill (simulated)', gst_return: 'GST return (simulated)' };
const MONEY_KEYS = /value|amount|tax|itc|payable/i;

export function ApprovalsPage() {
  const s = useAppState();
  const [focus] = useQueryParam('focus');
  const [tab, setTab] = useState<Tab>('pending');
  const list = useMemo(() => s.approvals.filter((a) => (tab === 'all' ? true : tab === 'pending' ? a.status === 'pending' : a.status !== 'pending')), [s.approvals, tab]);
  const pendingCount = s.approvals.filter((a) => a.status === 'pending').length;

  useEffect(() => {
    if (!focus) return;
    const a = s.approvals.find((x) => x.id === focus);
    if (a && a.status !== 'pending') setTab('all');
    const t = setTimeout(() => document.getElementById(`apr-${focus}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 120);
    return () => clearTimeout(t);
  }, [focus]); // runs once per focus target

  return (
    <div>
      <PageHeader eyebrow="Human control" title="Approval Center" description="Agents prepare the work. Anything external, statutory or irreversible waits here for your decision." />

      <Card className="mb-6 flex flex-col gap-4 p-5 md:flex-row md:items-center">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-cobalt-50 text-cobalt"><Fingerprint className="size-5" /></span>
        <div className="text-sm text-ink-500">
          <p className="font-semibold text-ink">Approvals are bound to the exact payload</p>
          Each request carries a SHA-256 hash of the exact data you approve. If anything changes after the request, for example an edited message or a new vehicle number, the old approval is <b>superseded</b> and a fresh, re-verified request is needed.
        </div>
      </Card>

      <div className="mb-4"><Tabs value={tab} onChange={setTab} items={[{ value: 'pending', label: 'Pending', count: pendingCount }, { value: 'decided', label: 'Decided' }, { value: 'all', label: 'All', count: s.approvals.length }]} /></div>

      {list.length === 0 ? (
        <Card><EmptyState icon={<BadgeCheck className="size-5" />} title={tab === 'pending' ? 'Nothing waiting for you' : 'No decisions yet'} body={tab === 'pending' ? 'When an agent needs your authorisation, it appears here. Try uploading the Shree Ganesh Steel sample invoice.' : undefined}
          action={tab === 'pending' ? <Link to="/invoices?upload=1"><Button variant="secondary">Upload an invoice</Button></Link> : undefined} /></Card>
      ) : (
        <div className="space-y-4">{list.map((a) => <ApprovalCard key={a.id} a={a} focused={a.id === focus} />)}</div>
      )}
    </div>
  );
}

function ApprovalCard({ a, focused }: { a: Approval; focused: boolean }) {
  const s = useAppState();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [editing, setEditing] = useState(false);
  const fu = a.kind === 'supplier_followup' ? s.followUps.find((f) => f.id === a.refId) : undefined;
  const pending = a.status === 'pending';
  const entries = Object.entries(a.payload).filter(([k]) => !['body', 'followUpId', 'paperId', 'shipmentId'].includes(k));

  const act = async (kind: 'approve' | 'reject') => {
    setBusy(kind);
    try { if (kind === 'approve') await approve(a.id, note); else await reject(a.id, note); } finally { setBusy(null); }
  };

  return (
    <Card id={`apr-${a.id}`} className={cx('overflow-hidden transition-shadow', focused && 'ring-2 ring-cobalt', !pending && 'opacity-90')} data-approval={a.kind}>
      <div className="flex flex-col gap-3 border-b border-beige-200 p-5 sm:flex-row sm:items-start">
        <AgentAvatar id={a.requestedBy} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{a.title}</h3><ApprovalStatusBadge status={a.status} /><Badge>{KIND[a.kind]}</Badge><Badge tone="neutral">v{a.version}</Badge></div>
          <p className="mt-0.5 text-sm text-ink-500">{a.summary}</p>
          <p className="mt-1 text-xs text-ink-400">Requested by {AGENTS[a.requestedBy].name} · {relTime(a.createdAt)}{a.decidedAt && ` · decided ${fmtDateTime(a.decidedAt)}`}</p>
        </div>
      </div>
      <div className="grid gap-5 p-5 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0">
          <div className="label-mono mb-2">Exact payload</div>
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {entries.map(([k, v]) => (
              <div key={k} className="min-w-0"><dt className="text-[11px] text-ink-400">{k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())}</dt><dd className="truncate text-sm font-medium" title={String(v)}>{typeof v === 'number' && MONEY_KEYS.test(k) ? inr(v) : String(v)}</dd></div>
            ))}
          </dl>
          {typeof a.payload.body === 'string' && <pre className="mt-3 max-h-56 overflow-auto rounded-xl bg-beige-50 p-3 font-sans text-[13px] whitespace-pre-wrap text-ink-700">{a.payload.body}</pre>}
        </div>
        <div className="space-y-3">
          <div className="rounded-2xl bg-beige-50 p-3">
            <div className="flex items-center gap-2 text-xs font-medium text-ink-700"><Fingerprint className="size-3.5" /> Payload hash</div>
            <p className="mt-1 font-mono text-[11px] break-all text-ink-500" title={a.payloadHash}>{a.payloadHash.startsWith('seed:') ? 'historical seed record' : shortHash(a.payloadHash)}</p>
          </div>
          <div className={cx('flex items-start gap-2 rounded-2xl p-3 text-xs', a.verificationPassed ? 'bg-ok-50 text-ok' : 'bg-bad-50 text-bad')}>
            {a.verificationPassed ? <ShieldCheck className="size-4 shrink-0" /> : <ShieldAlert className="size-4 shrink-0" />}
            <span>{a.verificationPassed ? 'Independently verified by the Verification Agent before this request.' : 'Verification did not pass. Approval is disabled.'}</span>
          </div>
          {a.decisionNote && !pending && <p className="rounded-2xl bg-beige-100 p-3 text-xs text-ink-700">{a.decisionNote}</p>}
          {a.kind === 'eway_bill' && <p className="text-xs text-ink-400">Approving generates a <b>simulated</b> e-way bill number. Nothing is sent to the portal.</p>}
          {a.kind === 'gst_return' && <p className="text-xs text-ink-400">Approving marks the return as submitted in <b>demo mode only</b>. File it on the GST portal yourself.</p>}
        </div>
      </div>
      {pending && (
        <div className="flex flex-col gap-3 border-t border-beige-200 bg-beige-50 p-4 md:flex-row md:items-center">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note for the audit trail" className="md:flex-1" aria-label="Decision note" />
          <div className="flex flex-wrap gap-2">
            {fu && <Button variant="secondary" icon={<PencilLine className="size-4" />} onClick={() => setEditing(true)}>Edit message</Button>}
            {a.kind === 'eway_bill' && <Link to={`/dispatch?open=${a.refId}`}><Button variant="secondary">Edit shipment</Button></Link>}
            <Button variant="danger" loading={busy === 'reject'} disabled={!!busy} onClick={() => void act('reject')}>Reject</Button>
            <Button loading={busy === 'approve'} disabled={!!busy || !a.verificationPassed} onClick={() => void act('approve')} data-action="approve">Approve</Button>
          </div>
        </div>
      )}
      {a.status === 'approved' && fu && (
        <div className="flex flex-wrap items-center gap-3 border-t border-beige-200 bg-ok-50/50 p-4 text-sm">
          <span className="flex-1 text-ink-500">Approved. Demo mode does not send email: open it in your email app or copy it.</span>
          <a href={`mailto:${fu.to}?subject=${encodeURIComponent(fu.subject)}&body=${encodeURIComponent(fu.body)}`}><Button size="sm" variant="secondary" icon={<Mail className="size-4" />}>Open in email app</Button></a>
          <Button size="sm" variant="ghost" onClick={() => void navigator.clipboard?.writeText(`${fu.subject}\n\n${fu.body}`)}>Copy</Button>
        </div>
      )}
      {editing && fu && <EditFollowUpModal id={fu.id} subject={fu.subject} body={fu.body} onClose={() => setEditing(false)} />}
    </Card>
  );
}
