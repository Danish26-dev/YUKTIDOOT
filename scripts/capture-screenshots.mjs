// Walks through both hackathon demo scenarios in a real browser, checks the outcomes,
// and saves screenshots to docs/screenshots/.
//
// Usage:
//   npm run build && npm run preview          (in one terminal)
//   CHROME_PATH="<path to chrome or edge>" npm run screenshots
//
// Exit code is non-zero if any check fails.
import puppeteer from 'puppeteer-core';
import { mkdirSync, existsSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:4173';
const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);
const executablePath = CANDIDATES.find((p) => existsSync(p));
if (!executablePath) { console.error('No Chrome/Edge found. Set CHROME_PATH.'); process.exit(2); }

const OUT = 'docs/screenshots';
mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? `  (${info})` : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 1 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

const state = async () => { await sleep(400); return page.evaluate(() => JSON.parse(localStorage.getItem('yuktidoot.demo.state') ?? 'null')); };
const go = async (path) => { await page.goto(BASE + path, { waitUntil: 'networkidle0' }); await sleep(500); };
const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });
const clickText = async (selector, text) => {
  const ok = await page.evaluate((sel, t) => {
    const el = [...document.querySelectorAll(sel)].find((e) => e.textContent?.trim().includes(t));
    if (el) { el.click(); return true; } return false;
  }, selector, text);
  if (!ok) throw new Error(`No ${selector} containing "${text}"`);
};
async function editBody(fn) {
  await clickText('button', 'Edit message');
  await sleep(400);
  await page.evaluate((src) => {
    const t = document.querySelector('#fu-body');
    const next = new Function('v', 'return ' + src)(t.value);
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(t, next);
    t.dispatchEvent(new Event('input', { bubbles: true }));
  }, fn);
  await clickText('button', 'Save new version');
}
async function waitFor(fn, label, timeout = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { const s = await state(); const v = s && fn(s); if (v) return v; await sleep(300); }
  throw new Error(`Timed out waiting for: ${label}`);
}

try {
  // fresh start
  await go('/');
  await page.evaluate(() => localStorage.clear());
  await go('/');
  check('Overview renders', await page.$eval('h1', (h) => /Good (morning|afternoon|evening)/.test(h.textContent)));
  await shot('01-overview');

  // ---------- Scenario 1: purchase invoice reconciliation ----------
  await go('/invoices?upload=1');
  await shot('02-upload-modal');
  await page.click('[data-sample="ganesh_mismatch"]');
  await sleep(2600);
  await shot('03-invoice-processing');
  const inv = await waitFor((s) => s.invoices.find((i) => i.number === 'SGST/2026/1187' && i.status === 'followup_pending' && s.approvals.some((a) => a.status === 'pending' && a.kind === 'supplier_followup')), 'mismatch + approval request');
  check('Extraction filled invoice fields', inv.lines.length === 3 && inv.totals.taxable === 101700, `taxable ${inv.totals.taxable}`);
  check('Mismatch detected with ITC at risk ₹4,212', inv.reconciliation.outcome === 'value_mismatch' && inv.reconciliation.itcAtRisk === 4212, `${inv.reconciliation.outcome} ${inv.reconciliation.itcAtRisk}`);
  check('Independent verification passed', inv.verification?.passed === true, `${inv.verification?.checks.length} checks`);
  let s = await state();
  const fu = s.followUps.find((f) => f.id === inv.followUpId);
  check('Supplier follow-up drafted', !!fu && fu.amountInQuestion === 4212 && fu.body.includes('SGST/2026/1187'));
  const run = s.runs.find((r) => r.id === inv.workflowRunId);
  check('Workflow waiting at approval node', run.status === 'waiting_approval' && run.nodes.find((n) => n.id === 'approval').status === 'waiting');
  check('Matched branch skipped', run.nodes.find((n) => n.id === 'reconciled').status === 'pending' || run.nodes.find((n) => n.id === 'reconciled').status === 'skipped');
  await shot('04-invoice-mismatch-drawer');

  await go(`/workflows?run=${run.id}`);
  await shot('05-workflow-graph-waiting');

  // payload-version consistency: edit the message -> old approval superseded, new v2 request
  const first = s.approvals.find((a) => a.status === 'pending' && a.kind === 'supplier_followup');
  await go(`/approvals?focus=${first.id}`);
  await shot('06-approval-center');
  await editBody("v.split('SGST/2026/1187').join('the invoice')");
  await sleep(1200);
  s = await state();
  check('Edit that drops the invoice number fails verification (no new approval)', s.approvals.find((a) => a.id === first.id).status === 'superseded' && !s.approvals.some((a) => a.kind === 'supplier_followup' && a.status === 'pending'));
  // recover: edit again from the invoice drawer, restoring the invoice number
  await go(`/invoices?open=${inv.id}`);
  await editBody("v.split('the invoice').join('SGST/2026/1187') + '\\n\\nPlease share the amended GSTR-1 reference once filed.'");
  s = await waitFor((st) => st.approvals.find((a) => a.kind === 'supplier_followup' && a.status === 'pending' && a.version === 2) && st, 'v2 approval');
  const old = s.approvals.find((a) => a.id === first.id);
  const v2 = s.approvals.find((a) => a.kind === 'supplier_followup' && a.status === 'pending');
  check('Editing payload supersedes earlier approval', old.status === 'superseded');
  check('Valid re-edit from invoice drawer creates new approval with a different hash', v2.payloadHash !== first.payloadHash && v2.payloadHash.startsWith('sha256:'), v2.payloadHash.slice(0, 20));

  // approve v2
  await go(`/approvals?focus=${v2.id}`);
  await page.evaluate((id) => document.querySelector(`#apr-${id} [data-action="approve"]`).click(), v2.id);
  s = await waitFor((st) => st.runs.find((r) => r.id === run.id && r.status === 'completed') && st, 'run completed after approval');
  const invDone = s.invoices.find((i) => i.id === inv.id);
  check('Approval resumes workflow to completion', s.runs.find((r) => r.id === run.id).status === 'completed');
  check('Invoice shows follow-up approved', invDone.status === 'followup_approved');
  await shot('07-approved');
  await go(`/invoices?open=${inv.id}`);
  await clickText('button', 'Simulate supplier correction');
  s = await waitFor((st) => st.invoices.find((i) => i.id === inv.id && i.status === 'resolved') && st, 'resolved after correction');
  check('Supplier correction resolves discrepancy', s.invoices.find((i) => i.id === inv.id).reconciliation.itcAtRisk === 0);
  await shot('08-invoice-resolved');

  // matched invoice, missing-in-GST invoice, blurry photo, duplicate
  await go('/invoices?upload=1'); await page.click('[data-sample="patel_matched"]');
  s = await waitFor((st) => st.invoices.find((i) => i.number === 'PPI/26-27/0442' && i.status === 'matched' && st.runs.find((r) => r.id === i.workflowRunId)?.status === 'completed') && st, 'Patel matched');
  check('Matching invoice completes without approval', true);
  await go('/invoices?upload=1'); await page.click('[data-sample="kaveri_missing"]');
  s = await waitFor((st) => st.invoices.find((i) => i.number === 'KL/2627/0093' && i.status === 'followup_pending') && st, 'Kaveri missing');
  check('Unfiled invoice flagged, full ITC at risk', s.invoices.find((i) => i.number === 'KL/2627/0093').reconciliation.itcAtRisk === 9261);
  await go('/invoices?upload=1'); await page.click('[data-sample="blurry_photo"]');
  s = await waitFor((st) => st.invoices.find((i) => i.status === 'extraction_failed') && st, 'blurry failure');
  check('Unreadable upload fails safely (no guessed fields)', s.invoices.find((i) => i.status === 'extraction_failed').lines.length === 0);
  await go('/invoices?upload=1'); await page.click('[data-sample="patel_matched"]');
  s = await waitFor((st) => st.invoices.find((i) => i.status === 'duplicate') && st, 'duplicate');
  check('Duplicate invoice blocked', s.invoices.filter((i) => i.number === 'PPI/26-27/0442' && i.status !== 'duplicate').length === 1);
  // invalid upload type
  await go('/invoices?upload=1');
  const input = await page.$('[data-testid="file-input"]');
  await page.evaluate(() => {
    const dt = new DataTransfer(); dt.items.add(new File(['x'], 'notes.txt', { type: 'text/plain' }));
    const el = document.querySelector('[data-testid="file-input"]'); el.files = dt.files; el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await sleep(500);
  check('Unsupported file type rejected with message', !!input && (await page.evaluate(() => document.body.innerText.includes('not a supported file'))));
  await go('/reconciliation');
  await shot('09-reconciliation');

  // ---------- Scenario 2: dispatch with missing vehicle number ----------
  await go('/dispatch?open=SH-1042');
  await page.click('[data-action="validate"]');
  s = await waitFor((st) => st.shipments.find((x) => x.id === 'SH-1042' && x.status === 'blocked') && st, 'SH-1042 blocked');
  const sh = s.shipments.find((x) => x.id === 'SH-1042');
  check('Missing vehicle number blocks shipment', sh.validation.issues.some((i) => i.code === 'VEHICLE_MISSING' && i.severity === 'block'));
  check('Dispatch run stopped at block node', s.runs.find((r) => r.id === sh.workflowRunId).status === 'stopped');
  check('No approval requested for blocked shipment', !s.approvals.some((a) => a.refId === 'SH-1042'));
  await sleep(300);
  await shot('10-dispatch-blocked');
  await page.type('#veh', 'MH09CU4417');
  await page.click('[data-action="validate"]');
  s = await waitFor((st) => st.approvals.find((a) => a.refId === 'SH-1042' && a.status === 'pending') && st, 'eway approval');
  check('Valid vehicle passes and requests approval', s.shipments.find((x) => x.id === 'SH-1042').status === 'awaiting_approval');
  const ewa0 = s.approvals.find((a) => a.refId === 'SH-1042' && a.status === 'pending');
  const runBefore = s.shipments.find((x) => x.id === 'SH-1042').workflowRunId;
  await go('/dispatch?open=SH-1042');
  await page.focus('#veh'); await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control'); await page.keyboard.press('Backspace'); await page.type('#veh', 'MH09CU4418');
  await page.click('[data-action="validate"]');
  s = await waitFor((st) => st.approvals.find((a) => a.refId === 'SH-1042' && a.status === 'pending' && a.id !== ewa0.id) && st, 'new eway approval after vehicle change');
  check('Changing vehicle during approval supersedes it and stops that run', s.approvals.find((a) => a.id === ewa0.id).status === 'superseded' && s.runs.find((r) => r.id === runBefore).status === 'stopped');
  const ewa = s.approvals.find((a) => a.refId === 'SH-1042' && a.status === 'pending');
  await go(`/approvals?focus=${ewa.id}`);
  await page.evaluate((id) => document.querySelector(`#apr-${id} [data-action="approve"]`).click(), ewa.id);
  s = await waitFor((st) => st.shipments.find((x) => x.id === 'SH-1042' && x.status === 'eway_generated') && st, 'eway generated');
  check('Simulated e-way bill generated after approval', s.shipments.find((x) => x.id === 'SH-1042').ewbNumber.startsWith('SIM-'));
  await go('/dispatch?open=SH-1042');
  await shot('11-dispatch-ready');

  // below-threshold shipment
  await go('/dispatch?open=SH-1043'); await page.click('[data-action="validate"]');
  s = await waitFor((st) => st.shipments.find((x) => x.id === 'SH-1043' && x.status === 'not_required') && st, 'SH-1043 not required');
  check('Below ₹50,000: e-way bill not required', true);

  // ---------- GSTR-3B ----------
  await go('/compliance'); await clickText('button', 'Prepare working paper');
  s = await waitFor((st) => st.approvals.find((a) => a.kind === 'gst_return' && a.status === 'pending') && st, 'gst approval');
  check('GSTR-3B working paper prepared & verified', s.workingPapers[0]?.status === 'awaiting_approval');
  await shot('12-compliance');

  // ---------- remaining pages ----------
  await go('/profile');
  await page.select('select[aria-label="Registration type"]', 'composition'); await sleep(300);
  await go('/workflows'); await clickText('button', 'New workflow'); await sleep(500);
  const compNodes = await page.evaluate(() => /Preview · (\d+) nodes/i.exec(document.body.innerText)?.[1]);
  await page.keyboard.press('Escape');
  await go('/profile');
  await page.select('select[aria-label="Registration type"]', 'regular'); await sleep(300);
  await go('/workflows'); await clickText('button', 'New workflow'); await sleep(500);
  const regNodes = await page.evaluate(() => /Preview · (\d+) nodes/i.exec(document.body.innerText)?.[1]);
  await page.keyboard.press('Escape');
  check('Workflow Builder plans differently for composition dealers', compNodes === '5' && regNodes === '11', `composition ${compNodes}, regular ${regNodes}`);
  await go('/profile'); await shot('13-business-profile');
  await clickText('button', 'Re-run photo onboarding'); await sleep(300);
  await page.click('[data-action="sample-photo"]'); await sleep(1200); await shot('14-photo-analysing');
  await sleep(2000); await shot('15-photo-review');
  await page.keyboard.press('Escape');
  await go('/agents'); await shot('16-agents');
  await go('/documents'); await shot('17-documents');
  await go('/activity'); await shot('18-activity');
  await go('/workflows'); await shot('19-workflows');
  await go('/this-does-not-exist');
  check('Unknown route shows not-found page', await page.evaluate(() => document.body.innerText.includes('Page not found')));

  // mobile layout
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  const overflowing = [];
  for (const p of ['/', '/profile', '/documents', '/invoices', '/reconciliation', '/compliance', '/dispatch', '/agents', '/workflows', '/approvals', '/activity']) {
    await go(p);
    if (p === '/') await shot('20-mobile-overview');
    if (p === '/invoices') await shot('21-mobile-invoices');
    if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) overflowing.push(p);
  }
  check('No horizontal page overflow at 390px on all 11 pages', overflowing.length === 0, overflowing.join(', '));

  check('No uncaught page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) {
  check(`Walkthrough aborted: ${e.message}`, false);
  await shot('zz-failure').catch(() => {});
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed. Screenshots in ${OUT}/`);
process.exit(failed ? 1 : 0);
