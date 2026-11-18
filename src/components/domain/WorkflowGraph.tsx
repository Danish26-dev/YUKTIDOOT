import { useEffect, useMemo, useRef } from 'react';
import { CheckCircle2, CircleDashed, Clock, Loader2, MinusCircle, XCircle } from 'lucide-react';
import type { WorkflowNode, WorkflowRun } from '@/types';
import { AgentAvatar } from './AgentChip';
import { AGENTS } from '@/data/agents';
import { cx } from '@/lib/util';

const NW = 196, NH = 84, GX = 52, GY = 34, PAD = 18;

const STATUS_STYLE: Record<WorkflowNode['status'], string> = {
  pending: 'border-beige-300 bg-white',
  running: 'border-cobalt bg-cobalt-50 ring-4 ring-cobalt/15',
  done: 'border-ok/40 bg-white',
  skipped: 'border-dashed border-beige-300 bg-beige-50 opacity-55',
  failed: 'border-bad bg-bad-50',
  waiting: 'border-sun bg-sun-50 ring-4 ring-sun/25',
};
const STATUS_ICON = { pending: CircleDashed, running: Loader2, done: CheckCircle2, skipped: MinusCircle, failed: XCircle, waiting: Clock };
const ICON_COLOR = { pending: 'text-ink-300', running: 'text-cobalt animate-spin', done: 'text-ok', skipped: 'text-ink-300', failed: 'text-bad', waiting: 'text-sun-700' };

export function WorkflowGraph({ run, onSelect, selected }: { run: Pick<WorkflowRun, 'nodes' | 'edges' | 'status'>; onSelect?: (id: string) => void; selected?: string }) {
  const { width, height, pos } = useMemo(() => {
    const cols = Math.max(...run.nodes.map((n) => n.col)) + 1;
    const rows = Math.max(...run.nodes.map((n) => n.row)) + 1;
    const p = new Map(run.nodes.map((n) => [n.id, { x: PAD + n.col * (NW + GX), y: PAD + n.row * (NH + GY) }]));
    return { width: PAD * 2 + cols * NW + (cols - 1) * GX, height: PAD * 2 + rows * NH + (rows - 1) * GY, pos: p };
  }, [run.nodes]);

  const planning = run.status === 'planning';
  const scroller = useRef<HTMLDivElement>(null);
  const active = run.nodes.find((n) => n.status === 'running' || n.status === 'waiting' || n.status === 'failed');
  // keep the step that is currently executing (or waiting / failed) in view on narrow screens
  useEffect(() => {
    const el = scroller.current;
    if (!el || !active) return;
    const x = pos.get(active.id)!.x;
    if (x < el.scrollLeft || x + NW > el.scrollLeft + el.clientWidth) el.scrollTo({ left: Math.max(0, x - 60), behavior: 'smooth' });
  }, [active?.id, active?.status, pos]);

  return (
    <div ref={scroller} className="overflow-x-auto rounded-2xl border border-beige-200 bg-[radial-gradient(circle,#d3d0c3_1px,transparent_1px)] [background-size:18px_18px]">
      <div className="relative" style={{ width, height }}>
        <svg className="absolute inset-0" width={width} height={height} aria-hidden>
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#7d7d87" /></marker>
            <marker id="arrow-on" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#1546D9" /></marker>
          </defs>
          {run.edges.map((e, i) => {
            const a = pos.get(e.from)!, b = pos.get(e.to)!;
            const from = run.nodes.find((n) => n.id === e.from)!, to = run.nodes.find((n) => n.id === e.to)!;
            const x1 = a.x + NW, y1 = a.y + NH / 2, x2 = b.x, y2 = b.y + NH / 2;
            const mx = (x1 + x2) / 2;
            const taken = from.status === 'done' && to.status !== 'pending' && to.status !== 'skipped';
            const active = taken && (to.status === 'running' || to.status === 'waiting');
            const skipped = to.status === 'skipped';
            return (
              <g key={i} className={planning ? 'animate-fade-up' : undefined} style={planning ? { animationDelay: `${(from.col + 1) * 110}ms` } : undefined}>
                <path d={`M${x1} ${y1} C${mx} ${y1}, ${mx} ${y2}, ${x2 - 4} ${y2}`} fill="none" stroke={taken ? '#1546D9' : '#a3a3ab'} strokeWidth={taken ? 2 : 1.4} strokeDasharray={active ? '6 4' : skipped ? '3 4' : undefined} className={active ? 'animate-flow' : undefined} markerEnd={taken ? 'url(#arrow-on)' : 'url(#arrow)'} opacity={skipped ? 0.45 : 1} />
                {e.label && (
                  <g transform={`translate(${mx}, ${(y1 + y2) / 2})`}>
                    <rect x={-(e.label.length * 6.6 + 18) / 2} y={-10} width={e.label.length * 6.6 + 18} height={20} rx={10} fill={taken ? '#1546D9' : '#fff'} stroke={taken ? '#1546D9' : '#d3d0c3'} />
                    <text textAnchor="middle" dy={4} fontSize={10.5} fontFamily="JetBrains Mono Variable, monospace" fill={taken ? '#fff' : '#5c5c66'}>{e.label}</text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>
        {run.nodes.map((n) => {
          const p = pos.get(n.id)!;
          const I = STATUS_ICON[n.status];
          return (
            <button
              key={n.id}
              type="button"
              onClick={() => onSelect?.(n.id)}
              className={cx('absolute flex flex-col rounded-2xl border p-3 text-left shadow-card transition-all hover:-translate-y-0.5', STATUS_STYLE[n.status], selected === n.id && 'outline-2 outline-offset-2 outline-ink', planning && 'animate-fade-up', n.kind === 'decision' && 'rounded-[22px]', n.kind === 'approval' && 'border-2')}
              style={{ left: p.x, top: p.y, width: NW, height: NH, animationDelay: planning ? `${n.col * 110 + n.row * 60}ms` : undefined }}
              title={n.detail ?? n.rationale}
            >
              <div className="flex items-center gap-2">
                <AgentAvatar id={n.agent} size="sm" />
                <span className="min-w-0 flex-1 truncate font-mono text-[10px] tracking-wider text-ink-400 uppercase">{n.kind === 'decision' ? 'Decision' : n.kind === 'approval' ? 'Human approval' : AGENTS[n.agent].short}</span>
                <I className={cx('size-4 shrink-0', ICON_COLOR[n.status])} aria-label={n.status} />
              </div>
              <span className="mt-1.5 line-clamp-2 text-[13px] leading-tight font-medium text-ink">{n.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
