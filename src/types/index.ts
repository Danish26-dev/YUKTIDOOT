// Domain model for the YUKTIDOOT frontend.
// These shapes are the contract a real backend (FastAPI + Google ADK) would return.

export type AgentId =
  | 'core'
  | 'builder'
  | 'document'
  | 'reconciliation'
  | 'compliance'
  | 'dispatch'
  | 'verification';

export type AgentStatus = 'idle' | 'running' | 'waiting' | 'completed' | 'error';

export interface AgentState {
  id: AgentId;
  status: AgentStatus;
  currentTask?: string;
  lastActive?: string;
  tasksCompleted: number;
}

// ---------- Business Context Profile ----------
export type FieldSource = 'photo_inferred' | 'owner_confirmed' | 'document_derived' | 'missing';

export interface ProfileField {
  key: string;
  label: string;
  value: string;
  source: FieldSource;
  confidence?: number; // 0..1, only for inferred values
  note?: string;
}

export interface BusinessProfile {
  businessName: string;
  ownerName: string;
  stateCode: string;
  gstin: string;
  registrationType: 'regular' | 'composition';
  fields: ProfileField[];
  onboardedAt?: string;
  photoAnalysedAt?: string;
}

// ---------- Suppliers, GST records ----------
export interface Supplier {
  id: string;
  name: string;
  gstin: string;
  city: string;
  stateCode: string;
  email: string;
  phone: string;
  category: string;
}

/** Simulated supplier-filed record, shaped like a GSTR-2B line. Not fetched from GSTN. */
export interface GstRecord {
  id: string;
  supplierGstin: string;
  invoiceNumber: string;
  invoiceDate: string;
  taxableValue: number;
  taxAmount: number;
  period: string; // e.g. 2026-10
  filedOn: string;
}

// ---------- Invoices ----------
export interface LineItem {
  description: string;
  hsn: string;
  qty: number;
  unit: string;
  rate: number;
  taxRate: number; // percent
}

export interface InvoiceTotals {
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
}

export type InvoiceStatus =
  | 'processing'
  | 'matched'
  | 'mismatch'
  | 'missing_in_gst'
  | 'followup_pending'
  | 'followup_approved'
  | 'duplicate'
  | 'resolved'
  | 'extraction_failed';

export interface ReconDifference {
  field: string;
  books: number;
  gst: number;
  diff: number;
}

export interface ReconciliationResult {
  outcome: 'matched' | 'value_mismatch' | 'missing_in_gst';
  gstRecordId?: string;
  differences: ReconDifference[];
  itcAtRisk: number;
  checkedAt: string;
  explanation: string;
}

export interface VerificationCheck {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
}

export interface VerificationReport {
  passed: boolean;
  checks: VerificationCheck[];
  verifiedAt: string;
  subject: string;
}

export interface Invoice {
  id: string;
  number: string;
  supplierId: string;
  supplierName: string;
  supplierGstin: string;
  date: string;
  placeOfSupply: string; // state code
  lines: LineItem[];
  totals: InvoiceTotals; // as printed on the document (extracted)
  status: InvoiceStatus;
  documentId?: string;
  extractionConfidence?: number;
  reconciliation?: ReconciliationResult;
  verification?: VerificationReport;
  followUpId?: string;
  workflowRunId?: string;
  createdAt: string;
}

// ---------- Supplier follow-ups ----------
export interface FollowUp {
  id: string;
  invoiceId: string;
  supplierId: string;
  to: string;
  subject: string;
  body: string;
  amountInQuestion: number;
  status: 'draft' | 'awaiting_approval' | 'approved' | 'rejected';
  version: number;
  createdAt: string;
  approvedAt?: string;
}

// ---------- Approvals ----------
export type ApprovalKind = 'supplier_followup' | 'eway_bill' | 'gst_return';

export interface Approval {
  id: string;
  kind: ApprovalKind;
  title: string;
  summary: string;
  refId: string; // follow-up id / shipment id / working paper id
  payload: Record<string, string | number>;
  payloadHash: string;
  version: number;
  status: 'pending' | 'approved' | 'rejected' | 'superseded';
  requestedBy: AgentId;
  createdAt: string;
  decidedAt?: string;
  decisionNote?: string;
  workflowRunId?: string;
  verificationPassed: boolean;
}

// ---------- Dispatch ----------
export interface DispatchIssue {
  code: string;
  severity: 'block' | 'warn';
  field?: keyof Shipment;
  message: string;
}

export interface DispatchValidation {
  canMove: boolean;
  ewayRequired: boolean;
  validityDays: number;
  issues: DispatchIssue[];
  checkedAt: string;
}

export type ShipmentStatus = 'draft' | 'blocked' | 'ready' | 'awaiting_approval' | 'eway_generated' | 'not_required';

export interface Shipment {
  id: string;
  invoiceNumber: string;
  consignee: string;
  consigneeGstin: string;
  toCity: string;
  fromPin: string;
  toPin: string;
  distanceKm: number;
  value: number;
  hsn: string;
  goods: string;
  vehicleNumber: string;
  transporterId: string;
  status: ShipmentStatus;
  validation?: DispatchValidation;
  ewbNumber?: string;
  createdAt: string;
  workflowRunId?: string;
}

// ---------- Compliance ----------
export interface Deadline {
  id: string;
  form: string;
  description: string;
  period: string;
  dueDate: string;
  status: 'filed' | 'upcoming' | 'overdue';
  filedOn?: string;
  /** true when 'filed' was set by the demo's simulated submission, not a real portal filing */
  simulated?: boolean;
}

export interface WorkingPaper {
  id: string;
  form: string;
  period: string;
  createdAt: string;
  rows: { label: string; value: number }[];
  status: 'prepared' | 'awaiting_approval' | 'approved_simulated' | 'rejected';
}

// ---------- Documents ----------
export type DocumentType = 'purchase_invoice' | 'receipt' | 'business_photo' | 'eway_draft' | 'working_paper' | 'other';

export interface DocumentItem {
  id: string;
  name: string;
  type: DocumentType;
  sizeKb: number;
  uploadedAt: string;
  status: 'processing' | 'processed' | 'needs_review' | 'failed';
  linkedId?: string;
  source: 'upload' | 'sample' | 'generated';
  note?: string;
  /** which demo sample the extraction simulator mapped this upload to */
  sampleKey?: string;
}

// ---------- Workflows ----------
export type WorkflowTemplate = 'purchase_invoice' | 'dispatch_check' | 'gst_readiness';
export type NodeKind = 'task' | 'decision' | 'approval' | 'end';
export type NodeStatus = 'pending' | 'running' | 'done' | 'skipped' | 'failed' | 'waiting';

export interface WorkflowNode {
  id: string;
  label: string;
  agent: AgentId;
  kind: NodeKind;
  handler: string;
  col: number;
  row: number;
  status: NodeStatus;
  detail?: string;
  rationale: string;
  startedAt?: string;
  endedAt?: string;
}

export interface WorkflowEdge {
  from: string;
  to: string;
  label?: string;
}

export type RunStatus = 'planning' | 'running' | 'waiting_approval' | 'completed' | 'failed' | 'stopped';

export interface WorkflowRun {
  id: string;
  template: WorkflowTemplate;
  objective: string;
  refId: string;
  status: RunStatus;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  createdAt: string;
  finishedAt?: string;
  waitingNodeId?: string;
  failureReason?: string;
}

// ---------- Activity ----------
export interface ActivityEntry {
  id: string;
  at: string;
  agent: AgentId | 'owner';
  level: 'info' | 'success' | 'warning' | 'error' | 'approval';
  message: string;
  refId?: string;
}

// ---------- Root state ----------
export interface AppState {
  schemaVersion: number;
  profile: BusinessProfile;
  suppliers: Supplier[];
  gstRecords: GstRecord[];
  invoices: Invoice[];
  followUps: FollowUp[];
  approvals: Approval[];
  shipments: Shipment[];
  deadlines: Deadline[];
  workingPapers: WorkingPaper[];
  documents: DocumentItem[];
  runs: WorkflowRun[];
  agents: Record<AgentId, AgentState>;
  activity: ActivityEntry[];
  /** Monthly aggregates (mock books) used for charts and the GSTR-3B working paper. */
  monthly: { period: string; outwardTaxable: number; outputTax: number; purchases: number; itcClaimed: number }[];
}
