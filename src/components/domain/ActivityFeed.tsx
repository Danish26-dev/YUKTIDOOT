import type { ActivityEntry } from '@/types';
import { AgentAvatar, AgentName } from './AgentChip';
import { relTime } from '@/lib/format';
import { cx } from '@/lib/util';

const DOT = { info: 'bg-ink-300', success: 'bg-ok', warning: 'bg-sun', error: 'bg-bad', approval: 'bg-cobalt' };

export function ActivityFeed({ items, empty = 'No activity yet.' }: { items: ActivityEntry[]; empty?: string }) {
  if (!items.length) return <p className="px-5 py-8 text-center text-sm text-ink-400">{empty}</p>;
  return (
    <ol className="divide-y divide-beige-200">
      {items.map((a) => (
        <li key={a.id} className="flex gap-3 px-5 py-3 animate-fade-up">
          <AgentAvatar id={a.agent} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] leading-snug text-ink-700">
              <span className="font-semibold text-ink"><AgentName id={a.agent} /></span> · {a.message}
            </p>
            <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-ink-400"><span className={cx('size-1.5 rounded-full', DOT[a.level])} />{relTime(a.at)}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
