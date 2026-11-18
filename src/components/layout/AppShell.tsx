import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  Activity, BadgeCheck, Bell, Bot, Building2, FileStack, FileText, GitBranch, Landmark, LayoutDashboard, Menu, RotateCcw, Scale, Truck, X, FlaskConical,
} from 'lucide-react';
import { useAppState } from '@/store/store';
import { resetDemo } from '@/store/actions';
import { cx } from '@/lib/util';
import { Button } from '@/components/ui/primitives';
import { ConfirmDialog, Modal } from '@/components/ui/overlays';
import { ErrorBoundary } from './ErrorBoundary';
import { inferenceStatus } from '@/services/inference';
import { Logo } from './Logo';

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; badge?: number; badgeTone?: 'sun' | 'bad' };

export function AppShell() {
  const s = useAppState();
  const loc = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  useEffect(() => { setMobileOpen(false); window.scrollTo(0, 0); }, [loc.pathname]);

  const pending = s.approvals.filter((a) => a.status === 'pending').length;
  const attention = s.invoices.filter((i) => ['mismatch', 'missing_in_gst', 'extraction_failed'].includes(i.status)).length;
  const blocked = s.shipments.filter((x) => x.status === 'blocked').length;
  const running = s.runs.filter((r) => r.status === 'running' || r.status === 'planning').length;

  const groups: { title: string; items: NavItem[] }[] = useMemo(() => [
    { title: 'Workspace', items: [
      { to: '/', label: 'Overview', icon: LayoutDashboard },
      { to: '/profile', label: 'Business Profile', icon: Building2 },
      { to: '/documents', label: 'Documents', icon: FileStack },
    ] },
    { title: 'Finance & compliance', items: [
      { to: '/invoices', label: 'Invoices', icon: FileText, badge: attention || undefined, badgeTone: 'bad' },
      { to: '/reconciliation', label: 'Supplier Reconciliation', icon: Scale },
      { to: '/compliance', label: 'GST & Compliance', icon: Landmark },
      { to: '/dispatch', label: 'Dispatch & E-way Bill', icon: Truck, badge: blocked || undefined, badgeTone: 'bad' },
    ] },
    { title: 'Intelligence', items: [
      { to: '/agents', label: 'AI Agents', icon: Bot, badge: running || undefined },
      { to: '/workflows', label: 'Workflow Center', icon: GitBranch },
      { to: '/approvals', label: 'Approval Center', icon: BadgeCheck, badge: pending || undefined, badgeTone: 'sun' },
      { to: '/activity', label: 'Activity Logs', icon: Activity },
    ] },
  ], [attention, blocked, running, pending]);

  const current = groups.flatMap((g) => g.items).find((i) => (i.to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(i.to)));

  const nav = (
    <nav className="flex h-full flex-col">
      <Link to="/" className="flex items-center gap-2.5 px-5 pt-5 pb-6"><Logo /></Link>
      <div className="flex-1 space-y-6 overflow-y-auto px-3 pb-4">
        {groups.map((g) => (
          <div key={g.title}>
            <div className="label-mono mb-1.5 px-3 text-[10px] text-white/40">{g.title}</div>
            <ul className="space-y-0.5">
              {g.items.map((it) => (
                <li key={it.to}>
                  <NavLink
                    to={it.to}
                    end={it.to === '/'}
                    className={({ isActive }) => cx('group flex items-center gap-3 rounded-xl px-3 py-2 text-[13.5px] transition-colors', isActive ? 'bg-white text-ink shadow-sm' : 'text-white/75 hover:bg-white/10 hover:text-white')}
                  >
                    {({ isActive }) => (<>
                      <it.icon className={cx('size-[18px]', isActive ? 'text-cobalt' : 'text-white/55 group-hover:text-white')} aria-hidden />
                      <span className="flex-1 truncate">{it.label}</span>
                      {it.badge !== undefined && (
                        <span className={cx('min-w-5 rounded-full px-1.5 text-center text-[11px] font-semibold tabular-nums', it.badgeTone === 'sun' ? 'bg-sun text-ink' : it.badgeTone === 'bad' ? 'bg-bad text-white' : 'bg-cobalt text-white')}>{it.badge}</span>
                      )}
                    </>)}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="m-3 rounded-2xl bg-white/[0.06] p-3.5 text-white/80">
        <div className="flex items-center gap-2 text-xs font-medium"><FlaskConical className="size-3.5 text-sun" /> Demo mode</div>
        <p className="mt-1 text-[11.5px] leading-snug text-white/55">Backend, AI inference and GST portals are simulated in the browser.</p>
        <button onClick={() => setAboutOpen(true)} className="mt-2 text-[11.5px] font-medium text-sun hover:underline">What’s real and what isn’t →</button>
      </div>
    </nav>
  );

  return (
    <div className="min-h-dvh lg:pl-[260px]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[260px] bg-ink lg:block">{nav}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink/50" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[270px] bg-ink animate-fade-up">
            <button onClick={() => setMobileOpen(false)} className="absolute top-4 right-3 rounded-lg p-1.5 text-white/70 hover:bg-white/10" aria-label="Close menu"><X className="size-5" /></button>
            {nav}
          </aside>
        </div>
      )}

      <header className="sticky top-0 z-20 border-b border-beige-200 bg-beige/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-3 px-4 md:px-8">
          <button onClick={() => setMobileOpen(true)} className="rounded-lg p-2 text-ink-700 hover:bg-beige-200 lg:hidden" aria-label="Open menu"><Menu className="size-5" /></button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-ink-500">
              <span className="text-ink">{s.profile.businessName}</span>
              <span className="mx-2 text-ink-300">/</span>
              {current?.label ?? 'Not found'}
            </div>
          </div>
          <button onClick={() => setAboutOpen(true)} className="hidden items-center gap-1.5 rounded-full bg-sun-50 px-3 py-1 text-xs font-medium text-sun-700 ring-1 ring-sun-100 ring-inset hover:bg-sun-100 sm:inline-flex">
            <FlaskConical className="size-3.5" /> Demo mode · simulated backend
          </button>
          <Link to="/approvals" className="relative rounded-xl p-2 text-ink-700 hover:bg-beige-200" aria-label={`${pending} pending approvals`}>
            <Bell className="size-5" />
            {pending > 0 && <span className="absolute top-1 right-1 grid size-4 place-items-center rounded-full bg-sun text-[10px] font-bold text-ink">{pending}</span>}
          </Link>
          <span className="hidden md:block"><Button variant="secondary" size="sm" icon={<RotateCcw className="size-3.5" />} onClick={() => setConfirmReset(true)}>Reset demo</Button></span>
          <button onClick={() => setConfirmReset(true)} className="rounded-xl p-2 text-ink-700 hover:bg-beige-200 md:hidden" aria-label="Reset demo"><RotateCcw className="size-5" /></button>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-4 py-6 md:px-8 md:py-8">
        <ErrorBoundary key={loc.pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>

      <ConfirmDialog open={confirmReset} onClose={() => setConfirmReset(false)} onConfirm={resetDemo} title="Reset demo data?" body="All uploads, approvals and workflow runs from this session will be cleared and the starting data restored." confirmLabel="Reset" danger />
      <Modal open={aboutOpen} onClose={() => setAboutOpen(false)} title="What runs in this prototype" subtitle="Frontend only. No data leaves your browser." size="lg">
        <div className="grid gap-4 text-sm md:grid-cols-3">
          <div className="rounded-2xl bg-ok-50 p-4">
            <p className="font-semibold text-ok">Implemented in the browser</p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-ink-700">
              <li>All screens, navigation and forms</li>
              <li>Workflow Builder graphs and the step executor</li>
              <li>Rule-based reconciliation, GST arithmetic, GSTIN checksum, dispatch rules</li>
              <li>Independent verification checks</li>
              <li>SHA-256 payload-bound approvals</li>
              <li>CSV exports, local persistence</li>
            </ul>
          </div>
          <div className="rounded-2xl bg-sun-50 p-4">
            <p className="font-semibold text-sun-700">Simulated</p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-ink-700">
              <li>Document extraction (maps uploads to sample invoices)</li>
              <li>Photo understanding and chat intent (local mock provider)</li>
              <li>Supplier GST records (shaped like GSTR-2B)</li>
              <li>E-way bill numbers and GST submission</li>
              <li>Sending follow-ups (opens your email app instead)</li>
            </ul>
          </div>
          <div className="rounded-2xl bg-beige-100 p-4">
            <p className="font-semibold text-ink">Planned, not connected</p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-ink-700">
              <li>FastAPI backend and database</li>
              <li>Google ADK agent orchestration on Cloud Run</li>
              <li>0G Private Computer private inference</li>
              <li>GSP / GSTN and e-way bill portal integrations</li>
            </ul>
          </div>
        </div>
        <p className="mt-4 rounded-xl bg-beige-50 p-3 font-mono text-xs text-ink-500">Inference provider: {inferenceStatus.active}. {inferenceStatus.message}</p>
      </Modal>
    </div>
  );
}
