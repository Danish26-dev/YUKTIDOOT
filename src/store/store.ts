// Tiny external store (immer + useSyncExternalStore).
// The async workflow engine needs to read the *latest* state between awaits, which a
// component-local useReducer cannot provide. Persisted to localStorage so a demo survives reloads.
import { useSyncExternalStore } from 'react';
import { produce, type Draft } from 'immer';
import type { ActivityEntry, AgentId, AppState } from '@/types';
import { createSeed, SCHEMA_VERSION } from './seed';
import { nowIso, uid } from '@/lib/util';

const KEY = 'yuktidoot.demo.state';

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return createSeed();
    const parsed = JSON.parse(raw) as AppState;
    if (parsed.schemaVersion !== SCHEMA_VERSION) return createSeed();
    // Runs cannot continue across a reload (timers are gone). Fail them visibly instead of leaving them "running".
    return produce(parsed, (d) => {
      for (const r of d.runs) {
        if (r.status === 'running' || r.status === 'planning') {
          r.status = 'failed';
          r.failureReason = 'Interrupted by a page reload. Start the workflow again.';
          r.finishedAt = nowIso();
          for (const n of r.nodes) if (n.status === 'running') { n.status = 'failed'; n.detail = 'Interrupted'; } else if (n.status === 'pending') n.status = 'skipped';
          const inv = d.invoices.find((i) => i.id === r.refId && i.status === 'processing');
          if (inv) inv.status = 'extraction_failed';
        }
      }
      for (const doc of d.documents) if (doc.status === 'processing') { doc.status = 'needs_review'; doc.note = 'Processing was interrupted by a reload'; }
      for (const a of Object.values(d.agents)) if (a.status === 'running') { a.status = 'idle'; a.currentTask = undefined; }
    });
  } catch {
    return createSeed();
  }
}

let state: AppState = load();
const listeners = new Set<() => void>();
let persistTimer: ReturnType<typeof setTimeout> | undefined;

function persist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage full or disabled: demo keeps working in memory */ }
  }, 250);
}

export const store = {
  get: () => state,
  update(fn: (d: Draft<AppState>) => void) {
    state = produce(state, fn);
    persist();
    listeners.forEach((l) => l());
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => { listeners.delete(l); };
  },
  reset() {
    state = createSeed();
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
    persist();
    listeners.forEach((l) => l());
  },
};

export function useAppState() {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

export function log(agent: ActivityEntry['agent'], level: ActivityEntry['level'], message: string, refId?: string) {
  store.update((d) => {
    d.activity.unshift({ id: uid('act'), at: nowIso(), agent, level, message, refId });
    if (d.activity.length > 400) d.activity.length = 400;
  });
}

export function setAgent(id: AgentId, status: AppState['agents'][AgentId]['status'], currentTask?: string, completedDelta = 0) {
  store.update((d) => {
    const a = d.agents[id];
    a.status = status;
    a.currentTask = currentTask;
    a.lastActive = nowIso();
    a.tasksCompleted += completedDelta;
  });
}
