import { Bot, Boxes, FileText, GitBranch, Landmark, ShieldCheck, Truck, User } from 'lucide-react';
import type { AgentId, AgentStatus } from '@/types';
import { AGENTS } from '@/data/agents';
import { cx } from '@/lib/util';

export const AGENT_ICON: Record<AgentId | 'owner', typeof Bot> = {
  core: Bot, builder: GitBranch, document: FileText, reconciliation: Boxes, compliance: Landmark, dispatch: Truck, verification: ShieldCheck, owner: User,
};

export function AgentAvatar({ id, status, size = 'md' }: { id: AgentId | 'owner'; status?: AgentStatus; size?: 'sm' | 'md' | 'lg' }) {
  const I = AGENT_ICON[id];
  const dim = { sm: 'size-7 rounded-lg', md: 'size-9 rounded-xl', lg: 'size-12 rounded-2xl' }[size];
  const icon = { sm: 'size-3.5', md: 'size-4', lg: 'size-5' }[size];
  const base = id === 'core' ? 'bg-cobalt text-white' : id === 'builder' ? 'bg-sun text-ink' : id === 'verification' ? 'bg-ink text-white' : id === 'owner' ? 'bg-beige-200 text-ink-700' : 'bg-cobalt-50 text-cobalt';
  return (
    <span className={cx('relative grid shrink-0 place-items-center', dim, base, status === 'running' && 'animate-pulse-ring')}>
      <I className={icon} aria-hidden />
      {status && status !== 'idle' && (
        <span className={cx('absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2 ring-white', status === 'running' ? 'bg-cobalt' : status === 'waiting' ? 'bg-sun' : status === 'error' ? 'bg-bad' : 'bg-ok')} />
      )}
    </span>
  );
}

export function AgentName({ id }: { id: AgentId | 'owner' }) {
  return <>{id === 'owner' ? 'Owner' : AGENTS[id].short}</>;
}
