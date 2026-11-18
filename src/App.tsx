import { lazy, Suspense, type ComponentType } from 'react';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { Toaster } from '@/components/ui/Toaster';
import { Button, EmptyState, Skeleton } from '@/components/ui/primitives';

// Route-level code splitting: each page (and recharts) loads on demand.
const page = <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) =>
  lazy(() => load().then((m) => ({ default: m[name] })));

const Overview = page(() => import('@/pages/Overview'), 'Overview');
const BusinessProfilePage = page(() => import('@/pages/BusinessProfile'), 'BusinessProfilePage');
const DocumentsPage = page(() => import('@/pages/Documents'), 'DocumentsPage');
const InvoicesPage = page(() => import('@/pages/Invoices'), 'InvoicesPage');
const ReconciliationPage = page(() => import('@/pages/Reconciliation'), 'ReconciliationPage');
const CompliancePage = page(() => import('@/pages/Compliance'), 'CompliancePage');
const DispatchPage = page(() => import('@/pages/Dispatch'), 'DispatchPage');
const AgentsPage = page(() => import('@/pages/Agents'), 'AgentsPage');
const WorkflowsPage = page(() => import('@/pages/Workflows'), 'WorkflowsPage');
const ApprovalsPage = page(() => import('@/pages/Approvals'), 'ApprovalsPage');
const ActivityPage = page(() => import('@/pages/Activity'), 'ActivityPage');

function PageSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading page">
      <Skeleton className="h-3 w-40" />
      <Skeleton className="h-9 w-80" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
      <Skeleton className="h-72 rounded-2xl" />
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Suspense fallback={<PageSkeleton />}><Overview /></Suspense>} />
          {([
            ['profile', BusinessProfilePage], ['documents', DocumentsPage], ['invoices', InvoicesPage], ['reconciliation', ReconciliationPage],
            ['compliance', CompliancePage], ['dispatch', DispatchPage], ['agents', AgentsPage], ['workflows', WorkflowsPage],
            ['approvals', ApprovalsPage], ['activity', ActivityPage],
          ] as const).map(([path, P]) => <Route key={path} path={path} element={<Suspense fallback={<PageSkeleton />}><P /></Suspense>} />)}
          <Route path="*" element={<EmptyState title="Page not found" body="That page doesn’t exist in this prototype." action={<Link to="/"><Button>Back to overview</Button></Link>} />} />
        </Route>
      </Routes>
      <Toaster />
    </BrowserRouter>
  );
}
