import type { AgentId } from '@/types';

export interface AgentMeta {
  id: AgentId;
  name: string;
  short: string;
  role: 'master' | 'planner' | 'specialist';
  description: string;
  responsibilities: string[];
  tools: string[]; // approved tool registry entries this agent may call
}

export const AGENTS: Record<AgentId, AgentMeta> = {
  core: {
    id: 'core', name: 'YUKTIDOOT Core', short: 'Core', role: 'master',
    description: 'Master agent. Interprets the objective, holds the Business Context Profile and coordinates every other agent.',
    responsibilities: ['Understands user instructions', 'Maintains business context', 'Assigns tasks to specialists', 'Monitors progress and handles exceptions', 'Tracks completion'],
    tools: ['context.read', 'context.update', 'agents.delegate', 'activity.log'],
  },
  builder: {
    id: 'builder', name: 'Workflow Builder', short: 'Builder', role: 'planner',
    description: 'Separate planning agent. Turns an objective plus business context into a validated execution graph.',
    responsibilities: ['Creates task-specific workflows', 'Determines dependencies and order', 'Selects agents and approved tools', 'Adds conditional branches', 'Inserts human approval checkpoints'],
    tools: ['templates.read', 'graph.validate'],
  },
  document: {
    id: 'document', name: 'Document & Bookkeeping Agent', short: 'Documents', role: 'specialist',
    description: 'Extracts and classifies invoices, receipts and records; prepares draft bookkeeping entries.',
    responsibilities: ['Document classification', 'Field extraction', 'Draft purchase records'],
    tools: ['ocr.extract', 'documents.store', 'ledger.draft'],
  },
  reconciliation: {
    id: 'reconciliation', name: 'Supplier Reconciliation Agent', short: 'Reconciliation', role: 'specialist',
    description: 'Matches purchase invoices with supplier-filed GST records and drafts follow-ups for discrepancies.',
    responsibilities: ['Invoice-to-GST record matching', 'ITC at-risk calculation (rule engine)', 'Supplier follow-up drafts'],
    tools: ['gst_records.lookup', 'rules.reconcile', 'followup.draft'],
  },
  compliance: {
    id: 'compliance', name: 'GST & Compliance Agent', short: 'Compliance', role: 'specialist',
    description: 'Tracks obligations and deadlines and prepares GST/TDS working papers.',
    responsibilities: ['Deadline tracking', 'GSTR-3B working paper', 'TDS reminders'],
    tools: ['calendar.read', 'rules.gst_summary', 'papers.prepare'],
  },
  dispatch: {
    id: 'dispatch', name: 'Dispatch & E-way Bill Agent', short: 'Dispatch', role: 'specialist',
    description: 'Validates dispatch details and prepares e-way bill drafts before goods move.',
    responsibilities: ['Dispatch field validation', 'E-way bill applicability', 'E-way bill draft preparation'],
    tools: ['rules.dispatch', 'eway.draft'],
  },
  verification: {
    id: 'verification', name: 'Verification Agent', short: 'Verification', role: 'specialist',
    description: 'Independent checker. Recomputes figures from source data and never reuses another agent’s output as truth.',
    responsibilities: ['Recompute totals from line items', 'Re-query GST records', 'Validate drafts and evidence'],
    tools: ['rules.recompute', 'gst_records.lookup', 'evidence.check'],
  },
};

export const AGENT_ORDER: AgentId[] = ['core', 'builder', 'document', 'reconciliation', 'compliance', 'dispatch', 'verification'];
