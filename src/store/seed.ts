import type { AgentId, AgentState, AppState, Deadline, DocumentItem, GstRecord, Invoice, LineItem, Shipment, WorkflowRun } from '@/types';
import { CUSTOMERS, OWN_GSTIN, OWN_PIN, SUPPLIERS } from '@/data/parties';
import { dayIn, hoursAgo, monthsAgo, periodOf } from '@/data/dates';
import { SAMPLE_GST_RECORDS, SAMPLE_INVOICES, sampleDate } from '@/data/samples';
import { computeTotals, totalTax } from '@/lib/gst';
import { AGENT_ORDER } from '@/data/agents';
import { buildWorkflow } from '@/services/workflowBuilder';
import { validateShipment } from '@/services/dispatch';

export const SCHEMA_VERSION = 3;

const sup = (id: string) => SUPPLIERS.find((s) => s.id === id)!;

function seedInvoice(id: string, supplierId: string, number: string, monthsBack: number, day: number, lines: LineItem[], status: Invoice['status']): Invoice {
  const s = sup(supplierId);
  const totals = computeTotals(lines, s.stateCode, '27');
  return {
    id, number, supplierId, supplierName: s.name, supplierGstin: s.gstin, date: dayIn(monthsBack, day), placeOfSupply: '27',
    lines, totals, status, documentId: `doc_${id}`, extractionConfidence: 0.93 + (day % 5) / 100,
    reconciliation: { outcome: 'matched', gstRecordId: `gr_${id}`, differences: [], itcAtRisk: 0, checkedAt: dayIn(monthsBack, Math.min(day + 12, 28)), explanation: 'Taxable value and tax match the supplier’s filed record within ₹1.' },
    verification: { passed: true, subject: `Invoice ${number}`, verifiedAt: dayIn(monthsBack, Math.min(day + 12, 28)), checks: [
      { id: 'arith', label: 'Line-item arithmetic', passed: true, detail: `Recomputed ${lines.length} lines.` },
      { id: 'recon', label: 'Reconciliation re-check', passed: true, detail: 'Matched.' },
    ] },
    createdAt: dayIn(monthsBack, day),
  };
}

export function createSeed(): AppState {
  const P = periodOf(monthsAgo(1));
  const PP = periodOf(monthsAgo(2));

  const invoices: Invoice[] = [
    seedInvoice('inv_s1', 'sup_deccan', 'DTH/1452', 1, 3, [
      { description: 'Carbide turning insert CNMG 120408', hsn: '8209', qty: 40, unit: 'pcs', rate: 420, taxRate: 18 },
      { description: 'HSS drill bit 10 mm', hsn: '8207', qty: 25, unit: 'pcs', rate: 180, taxRate: 18 },
    ], 'matched'),
    seedInvoice('inv_s2', 'sup_ajanta', 'AE/26-27/0318', 1, 6, [
      { description: 'Contactor 25 A', hsn: '8536', qty: 6, unit: 'pcs', rate: 1850, taxRate: 18 },
      { description: 'FR copper cable 2.5 sq mm', hsn: '8544', qty: 120, unit: 'm', rate: 46, taxRate: 18 },
    ], 'matched'),
    seedInvoice('inv_s3', 'sup_ganesh', 'SGST/2026/1131', 1, 9, [
      { description: 'MS round bar 20 mm (IS 2062)', hsn: '7214', qty: 600, unit: 'kg', rate: 61, taxRate: 18 },
    ], 'matched'),
    seedInvoice('inv_s4', 'sup_patel', 'PPI/26-27/0398', 1, 12, [
      { description: '5-ply corrugated box 450×300×300', hsn: '4819', qty: 1000, unit: 'pcs', rate: 37, taxRate: 18 },
    ], 'matched'),
    seedInvoice('inv_s5', 'sup_deccan', 'DTH/1398', 2, 11, [
      { description: 'Parting blade 3 mm', hsn: '8208', qty: 12, unit: 'pcs', rate: 760, taxRate: 18 },
    ], 'matched'),
    seedInvoice('inv_s6', 'sup_kaveri', 'KL/2627/0071', 2, 20, [
      { description: 'Soluble cutting oil (210 L drum)', hsn: '2710', qty: 180, unit: 'L', rate: 240, taxRate: 18 },
    ], 'resolved'),
  ];
  invoices[5].reconciliation!.explanation = 'Initially missing from supplier filings; matched after the supplier filed it (follow-up approved by owner).';

  const gstRecords: GstRecord[] = invoices.map((i) => ({
    id: `gr_${i.id}`, supplierGstin: i.supplierGstin, invoiceNumber: i.number, invoiceDate: i.date,
    taxableValue: i.totals.taxable, taxAmount: totalTax(i.totals), period: periodOf(new Date(i.date)), filedOn: dayIn(periodOf(new Date(i.date)) === P ? 0 : 1, 11),
  }));
  for (const s of SAMPLE_INVOICES) {
    const r = SAMPLE_GST_RECORDS[s.key];
    if (!r) continue;
    gstRecords.push({ id: `gr_${s.key}`, supplierGstin: sup(s.supplierId).gstin, invoiceNumber: s.number, invoiceDate: sampleDate(s), taxableValue: r.taxable, taxAmount: r.tax, period: P, filedOn: dayIn(0, 11) });
  }

  const today = new Date();
  const d = (n: number, day: number) => dayIn(n, day);
  const status = (due: string): Deadline['status'] => (new Date(due) < new Date(today.getFullYear(), today.getMonth(), today.getDate()) ? 'overdue' : 'upcoming');
  const qEndMonth = Math.floor(monthsAgo(1).getMonth() / 3) * 3 + 2; // last month of the quarter containing P
  const qDue = new Date(monthsAgo(1).getFullYear(), qEndMonth + 2, 0, 12); // end of month after quarter end
  if (qEndMonth === 2) qDue.setMonth(4, 31); // Q4 (Jan–Mar) TDS return due 31 May
  const gstr1Due = d(0, 11);
  const tdsDue = d(0, 7);
  const deadlines: Deadline[] = [
    { id: 'dl_tds', form: 'TDS deposit', description: 'Deposit TDS deducted on contractor payments (Sec 194C)', period: P, dueDate: tdsDue, ...(today.getDate() > 7 ? { status: 'filed' as const, filedOn: d(0, 6) } : { status: status(tdsDue) }) },
    { id: 'dl_gstr1', form: 'GSTR-1', description: 'Outward supplies return', period: P, dueDate: gstr1Due, ...(today.getDate() > 11 ? { status: 'filed' as const, filedOn: d(0, 10) } : { status: status(gstr1Due) }) },
    { id: 'dl_gstr3b', form: 'GSTR-3B', description: 'Summary return and tax payment', period: P, dueDate: d(0, 20), status: status(d(0, 20)) },
    { id: 'dl_gstr1_next', form: 'GSTR-1', description: 'Outward supplies return', period: periodOf(monthsAgo(0)), dueDate: d(-1, 11), status: 'upcoming' },
    { id: 'dl_26q', form: 'TDS return (26Q)', description: 'Quarterly TDS statement', period: `${periodOf(new Date(monthsAgo(1).getFullYear(), qEndMonth - 2, 1))} to ${periodOf(new Date(monthsAgo(1).getFullYear(), qEndMonth, 1))}`, dueDate: qDue.toISOString(), status: 'upcoming' },
  ];

  const c = CUSTOMERS;
  const shipments: Shipment[] = [
    { id: 'SH-1041', invoiceNumber: 'SPW/26-27/0212', consignee: c[0].name, consigneeGstin: c[0].gstin, toCity: c[0].city, fromPin: OWN_PIN, toPin: c[0].pin, distanceKm: c[0].km, value: 184500, hsn: '8483', goods: 'Machined transmission shafts (240 pcs)', vehicleNumber: 'MH12AB4521', transporterId: '', status: 'eway_generated', ewbNumber: 'SIM-3410 2219 8807', createdAt: hoursAgo(30) },
    { id: 'SH-1042', invoiceNumber: 'SPW/26-27/0219', consignee: c[1].name, consigneeGstin: c[1].gstin, toCity: c[1].city, fromPin: OWN_PIN, toPin: c[1].pin, distanceKm: c[1].km, value: 236000, hsn: '8483', goods: 'Bronze-bushed shaft assemblies (90 pcs)', vehicleNumber: '', transporterId: '', status: 'draft', createdAt: hoursAgo(3) },
    { id: 'SH-1043', invoiceNumber: 'SPW/26-27/0220', consignee: c[2].name, consigneeGstin: c[2].gstin, toCity: c[2].city, fromPin: OWN_PIN, toPin: c[2].pin, distanceKm: c[2].km, value: 38500, hsn: '7318', goods: 'Turned fastener blanks (1,500 pcs)', vehicleNumber: '', transporterId: '', status: 'draft', createdAt: hoursAgo(2) },
  ];
  shipments[0].validation = validateShipment(shipments[0], hoursAgo(29));

  const documents: DocumentItem[] = [
    { id: 'doc_photo', name: 'workshop-photo.jpg', type: 'business_photo', sizeKb: 812, uploadedAt: d(2, 2), status: 'processed', source: 'sample', note: 'Used for the initial business understanding' },
    ...invoices.map<DocumentItem>((i) => ({ id: `doc_${i.id}`, name: `${i.supplierName.split(' ')[0].toLowerCase()}-${i.number.replace(/\//g, '-')}.pdf`, type: 'purchase_invoice', sizeKb: 140 + (i.lines.length * 37), uploadedAt: i.createdAt, status: 'processed', linkedId: i.id, source: 'sample' })),
    { id: 'doc_rcpt1', name: 'receipt-diesel-generator.jpg', type: 'receipt', sizeKb: 236, uploadedAt: d(1, 21), status: 'processed', source: 'sample', note: 'Fuel expense ₹2,450' },
    { id: 'doc_rcpt2', name: 'receipt-courier.jpg', type: 'receipt', sizeKb: 198, uploadedAt: d(1, 24), status: 'processed', source: 'sample', note: 'Courier expense ₹380' },
    { id: 'doc_ewb1', name: 'eway-draft-SH-1041.json', type: 'eway_draft', sizeKb: 3, uploadedAt: hoursAgo(29), status: 'processed', linkedId: 'SH-1041', source: 'generated', note: 'Simulated: not registered on the e-way bill portal' },
  ];

  const agents = Object.fromEntries(AGENT_ORDER.map((id, i) => [id, { id, status: 'idle', tasksCompleted: [41, 18, 64, 37, 12, 9, 52][i], lastActive: hoursAgo(1 + i) } satisfies AgentState])) as Record<AgentId, AgentState>;

  const profile: AppState['profile'] = {
    businessName: 'Sharma Precision Works',
    ownerName: 'Rakesh Sharma',
    stateCode: '27',
    gstin: OWN_GSTIN,
    registrationType: 'regular',
    onboardedAt: d(2, 2),
    photoAnalysedAt: d(2, 2),
    fields: [
      { key: 'type', label: 'Business type', value: 'Small manufacturing unit: metal machining', source: 'owner_confirmed', note: 'Inferred from workshop photo (82%), confirmed by owner' },
      { key: 'products', label: 'Products', value: 'Machined shafts, bushes and fastener blanks', source: 'owner_confirmed' },
      { key: 'activities', label: 'Operating activities', value: 'Turning, cutting, light fabrication', source: 'photo_inferred', confidence: 0.74 },
      { key: 'equipment', label: 'Equipment', value: 'Lathe, bench drill, workbench, storage racks', source: 'photo_inferred', confidence: 0.86 },
      { key: 'legalName', label: 'Legal name', value: 'Sharma Precision Works', source: 'owner_confirmed' },
      { key: 'gstin', label: 'GSTIN', value: OWN_GSTIN, source: 'owner_confirmed', note: 'Format and checksum valid. Not verified with GSTN in demo mode.' },
      { key: 'location', label: 'Location', value: 'Bhosari MIDC, Pune, Maharashtra (27)', source: 'owner_confirmed' },
      { key: 'turnover', label: 'Turnover band', value: '₹40 lakh – ₹1.5 crore', source: 'owner_confirmed' },
      { key: 'filing', label: 'GST filing', value: 'Regular, monthly GSTR-1 and GSTR-3B', source: 'owner_confirmed' },
      { key: 'suppliers', label: 'Main suppliers', value: SUPPLIERS.map((s) => s.name).join(', '), source: 'document_derived', note: 'Learned from purchase invoices' },
      { key: 'customers', label: 'Main customers', value: CUSTOMERS.map((x) => x.name).join(', '), source: 'document_derived', note: 'Learned from sales invoices and dispatches' },
      { key: 'tds', label: 'TDS obligations', value: 'Sec 194C contractor payments (job-work)', source: 'document_derived' },
    ],
  };

  const monthly = [5, 4, 3, 2, 1, 0].map((n, i) => {
    const outward = [612000, 668000, 701500, 645000, 732000, 389000][i];
    const purchases = [302000, 341000, 328500, 296000, 0, 0][i];
    return { period: periodOf(monthsAgo(n)), outwardTaxable: outward, outputTax: Math.round(outward * 0.18), purchases, itcClaimed: Math.round(purchases * 0.18) };
  });

  const runs: WorkflowRun[] = [];
  {
    const b = buildWorkflow('purchase_invoice', { profile, invoice: invoices[3] });
    const path = ['extract', 'identify', 'record', 'lookup', 'match', 'reconciled', 'verify', 'done'];
    runs.push({ id: 'run_seed_inv', template: 'purchase_invoice', objective: b.objective, refId: 'inv_s4', status: 'completed', edges: b.edges, createdAt: d(1, 12), finishedAt: d(1, 12),
      nodes: b.nodes.map((n) => ({ ...n, status: path.includes(n.id) ? 'done' : 'skipped', detail: path.includes(n.id) ? undefined : 'Branch not taken' })) });
    invoices[3].workflowRunId = 'run_seed_inv';
    const bd = buildWorkflow('dispatch_check', { profile, shipment: shipments[0] });
    const pd = ['fields', 'applicable', 'partb', 'draft', 'verify', 'approval', 'generate'];
    runs.push({ id: 'run_seed_dsp', template: 'dispatch_check', objective: bd.objective, refId: 'SH-1041', status: 'completed', edges: bd.edges, createdAt: hoursAgo(29), finishedAt: hoursAgo(29),
      nodes: bd.nodes.map((n) => ({ ...n, status: pd.includes(n.id) ? 'done' : 'skipped', detail: n.id === 'approval' ? 'Approved by owner' : pd.includes(n.id) ? undefined : 'Branch not taken' })) });
    shipments[0].workflowRunId = 'run_seed_dsp';
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    profile,
    suppliers: SUPPLIERS,
    gstRecords,
    invoices,
    followUps: [],
    approvals: [{
      id: 'apr_seed_dsp', kind: 'eway_bill', title: 'Generate e-way bill for SH-1041', summary: `${c[0].name} · ₹1,84,500 · MH12AB4521`, refId: 'SH-1041',
      payload: { shipmentId: 'SH-1041', vehicleNumber: 'MH12AB4521', value: 184500 }, payloadHash: 'seed:historical-record', version: 1,
      status: 'approved', requestedBy: 'dispatch', createdAt: hoursAgo(29.2), decidedAt: hoursAgo(29), decisionNote: 'Approved', workflowRunId: 'run_seed_dsp', verificationPassed: true,
    }],
    shipments,
    deadlines,
    workingPapers: [],
    documents,
    runs,
    agents,
    activity: [
      { id: 'a1', at: hoursAgo(29), agent: 'dispatch', level: 'success', message: 'E-way bill generated for SH-1041 (simulated): SIM-3410 2219 8807', refId: 'SH-1041' },
      { id: 'a2', at: hoursAgo(29.1), agent: 'owner', level: 'approval', message: 'Owner approved e-way bill for SH-1041', refId: 'apr_seed_dsp' },
      { id: 'a3', at: hoursAgo(29.3), agent: 'verification', level: 'success', message: 'SH-1041 verified: 4/4 checks passed', refId: 'SH-1041' },
      { id: 'a4', at: hoursAgo(50), agent: 'compliance', level: 'info', message: `GSTR-1 for ${P} marked filed by owner`, refId: 'dl_gstr1' },
      { id: 'a5', at: hoursAgo(74), agent: 'reconciliation', level: 'success', message: 'PPI/26-27/0398 matched with supplier GST record', refId: 'inv_s4' },
      { id: 'a6', at: hoursAgo(96), agent: 'core', level: 'info', message: `Business Context Profile updated: TDS obligation learned from job-work payments`, refId: 'profile' },
      { id: 'a7', at: hoursAgo(120), agent: 'reconciliation', level: 'success', message: `KL/2627/0071 resolved: supplier filed the missing invoice (${PP})`, refId: 'inv_s6' },
    ],
    monthly,
  };
}
