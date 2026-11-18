import { Link } from 'react-router-dom';
import { CheckCircle2, CircleDashed, Clock, Loader2, MinusCircle, XCircle } from 'lucide-react';
import type { WorkflowRun } from '@/types';
import { AGENTS } from '@/data/agents';
import { fmtTime } from '@/lib/format';
import { cx } from '@/lib/util';
import { RunStatusBadge } from './status';

const ICON = { pending: CircleDashed, running: Loader2, done: CheckCircle2, skipped: MinusCircle, failed: XCircle, waiting: Clock };
const COLOR = { pending: 'text-ink-300', running: 'text-cobalt animate-spin', done: 'text-ok', skipped: 'text-ink-300', failed: 'text-bad', waiting: 'text-sun-700' };

/** Execution order view of a run: the nodes actually visited, in order, with live status. */
export function RunTimeline({ run, compact, showLink = true }: { run: WorkflowRun; compact?: boolean; showLink?: boolean }) {
  const visited = run.nodes.filter((n) => n.status !== 'skipped' && n.status !== 'pending');
  const upcoming = run.status === 'running' || run.status === 'planning' ? run.nodes.filter((n) => n.status === 'pending').slice(0, 1) : [];
  const list = [...visited.sort((a, b) => (a.startedAt ?? '').localeCompare(b.startedAt ?? '')), ...upcoming];
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <RunStatusBadge status={run.status} />
        {showLink && <Link to={`/workflows?run=${run.id}`} className="text-xs font-medium text-cobalt hover:underline">Open in Workflow Center</Link>}
      </div>
      {run.status === 'planning' && <p className="mb-3 text-sm text-ink-500">Workflow Builder is planning the steps for this task…</p>}
      <ol className="relative space-y-0">
        {list.map((n, i) => {
          const I = ICON[n.status];
          return (
            <li key={n.id} className="relative flex gap-3 pb-4 animate-fade-up">
              {i < list.length - 1 && <span className="absolute top-6 bottom-0 left-[9px] w-px bg-beige-300" />}
              <I className={cx('relative z-10 mt-0.5 size-[19px] shrink-0 rounded-full bg-white', COLOR[n.status])} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className={cx('text-[13px] font-medium', n.status === 'pending' ? 'text-ink-400' : 'text-ink')}>{n.label}</span>
                  <span className="font-mono text-[10.5px] text-ink-400">{AGENTS[n.agent].short}{n.startedAt ? ` · ${fmtTime(n.startedAt)}` : ''}</span>
                </div>
                {!compact && n.detail && <p className={cx('mt-0.5 text-xs leading-snug break-words', n.status === 'failed' ? 'text-bad' : 'text-ink-500')}>{n.detail}</p>}
              </div>
            </li>
          );
        })}
      </ol>
      {run.failureReason && run.status !== 'completed' && <p className={cx('rounded-xl px-3 py-2 text-xs', run.status === 'failed' ? 'bg-bad-50 text-bad' : 'bg-beige-100 text-ink-700')}>{run.failureReason}</p>}
    </div>
  );
}
