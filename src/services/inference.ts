// Inference provider abstraction.
//
// In the target architecture, AI reasoning (photo understanding, document field extraction,
// intent interpretation) is routed through the 0G Private Computer private inference layer.
// This prototype ships ONLY a local mock provider. There is no 0G client in this codebase.
// Selecting VITE_INFERENCE_PROVIDER=0g is rejected explicitly instead of failing silently.
import { sleep } from '@/lib/util';

export interface InferredField {
  key: string;
  label: string;
  value: string;
  confidence: number;
}

export interface PhotoAnalysis {
  summary: string;
  fields: InferredField[];
  /** Things a photograph cannot establish; the owner must provide or confirm them. */
  questions: { key: string; label: string; why: string }[];
}

export type IntentId = 'process_invoice' | 'reconcile' | 'dispatch' | 'gst' | 'approvals' | 'profile' | 'agents' | 'unknown';

export interface IntentResult {
  intent: IntentId;
  confidence: number;
  reply: string;
  route?: string;
}

export interface InferenceProvider {
  id: string;
  label: string;
  mode: 'mock';
  analyseBusinessPhoto(file: Blob | null): Promise<PhotoAnalysis>;
  interpret(text: string): Promise<IntentResult>;
}

const INTENTS: { intent: IntentId; words: RegExp; reply: string; route: string }[] = [
  { intent: 'process_invoice', words: /\b(upload|process|add|scan)\b.*\b(invoice|bill)s?\b|\b(invoice|bill)s?\b.*\b(upload|process)/i, reply: 'I’ll process the purchase invoice: extract it, match it with the supplier’s GST record and verify the result. Upload it on the Invoices page.', route: '/invoices?upload=1' },
  { intent: 'reconcile', words: /\b(reconcil|mismatch|supplier|itc|2b|gstr-?2b|purchases?)\b/i, reply: 'Here is the reconciliation of your purchase invoices against supplier-filed GST records, with ITC at risk.', route: '/reconciliation' },
  { intent: 'dispatch', words: /\b(dispatch|e-?way|ship|vehicle|transport|consignment)\b/i, reply: 'Opening Dispatch. I check every shipment before goods move, including Part-B vehicle details.', route: '/dispatch' },
  { intent: 'gst', words: /\b(gst|3b|gstr|return|tds|deadline|due|compliance|tax)\b/i, reply: 'Here are your upcoming obligations and the GSTR-3B readiness for last month.', route: '/compliance' },
  { intent: 'approvals', words: /\b(approv|pending|sign|authori[sz]e)\b/i, reply: 'These items are waiting for your decision.', route: '/approvals' },
  { intent: 'profile', words: /\b(profile|my business|photo|onboard|about)\b/i, reply: 'This is what I understand about your business, and where each fact came from.', route: '/profile' },
  { intent: 'agents', words: /\b(agent|who is working|status|workflow)\b/i, reply: 'Here’s what each agent is doing right now.', route: '/agents' },
];

class MockInferenceProvider implements InferenceProvider {
  id = 'mock';
  label = 'Local mock provider (demo mode)';
  mode = 'mock' as const;

  async analyseBusinessPhoto(): Promise<PhotoAnalysis> {
    await sleep(2200);
    return {
      summary: 'Likely a small manufacturing unit doing metal machining. I can see a lathe, a workbench, stored steel stock and finished machined parts.',
      fields: [
        { key: 'type', label: 'Business type', value: 'Small manufacturing unit: metal machining (likely)', confidence: 0.82 },
        { key: 'products', label: 'Products', value: 'Machined metal components, shafts and bushes (likely)', confidence: 0.67 },
        { key: 'activities', label: 'Operating activities', value: 'Turning, cutting, light fabrication', confidence: 0.74 },
        { key: 'inputs', label: 'Typical purchases', value: 'Steel bars, cutting tools, cutting oil, packaging', confidence: 0.63 },
        { key: 'equipment', label: 'Visible equipment', value: 'Lathe, bench drill, workbench, storage racks', confidence: 0.86 },
      ],
      questions: [
        { key: 'gstin', label: 'GSTIN', why: 'Registration can’t be seen in a photograph.' },
        { key: 'legalName', label: 'Legal business name', why: 'Needed exactly as registered.' },
        { key: 'suppliers', label: 'Main suppliers', why: 'Supplier relationships come from records, not images.' },
        { key: 'turnover', label: 'Annual turnover band', why: 'Financial facts must come from the owner or books.' },
      ],
    };
  }

  async interpret(text: string): Promise<IntentResult> {
    await sleep(650);
    const hit = INTENTS.find((i) => i.words.test(text));
    if (!hit) return { intent: 'unknown', confidence: 0.2, reply: 'I’m not sure what you need yet. Try “check my supplier invoices”, “prepare GSTR-3B” or “dispatch to Kolhapur”.' };
    return { intent: hit.intent, confidence: 0.9, reply: hit.reply, route: hit.route };
  }
}

const requested = (import.meta.env.VITE_INFERENCE_PROVIDER ?? 'mock').toLowerCase();

export const inferenceStatus = {
  requested,
  active: 'mock',
  message: requested === 'mock'
    ? 'All AI steps use a local mock provider. 0G Private Computer is the planned private inference layer and is not connected.'
    : `VITE_INFERENCE_PROVIDER="${requested}" is not implemented in this prototype. Falling back to the local mock provider.`,
};

export const inference: InferenceProvider = new MockInferenceProvider();
