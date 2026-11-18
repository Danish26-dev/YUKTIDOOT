import { useEffect, useState } from 'react';
import { Camera, Check, FileText, MessageSquareText, Pencil, ScanSearch, ShieldCheck, Sparkles, UserCheck, X } from 'lucide-react';
import type { FieldSource, ProfileField } from '@/types';
import { useAppState } from '@/store/store';
import { analysePhoto, confirmProfile, setRegistrationType, updateProfileField, type OnboardingAnswers } from '@/store/actions';
import { Badge, Button, Card, CardHeader, Field, Input, PageHeader, ProgressBar, Select, type Tone } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/overlays';
import { Dropzone } from '@/components/ui/Dropzone';
import type { PhotoAnalysis } from '@/services/inference';
import { validateGstin } from '@/lib/gst';
import { fmtDate, pct } from '@/lib/format';
import { cx } from '@/lib/util';

const SOURCE: Record<FieldSource, [string, Tone, typeof Camera]> = {
  photo_inferred: ['From photo · unconfirmed', 'sun', Camera],
  owner_confirmed: ['Confirmed by owner', 'ok', UserCheck],
  document_derived: ['Learned from documents', 'cobalt', FileText],
  missing: ['Missing', 'bad', X],
};

export function BusinessProfilePage() {
  const s = useAppState();
  const p = s.profile;
  const [wizard, setWizard] = useState(false);
  const known = p.fields.filter((f) => f.source !== 'missing');
  const confirmed = p.fields.filter((f) => f.source === 'owner_confirmed' || f.source === 'document_derived');
  const completeness = p.fields.length ? confirmed.length / p.fields.length : 0;

  return (
    <div>
      <PageHeader eyebrow="Business Context Profile · shared by all agents" title={p.businessName} description="What YUKTIDOOT understands about your business, and where each fact came from. A photo gives a first impression; legal and financial facts come only from you or verified records."
        actions={<Button icon={<Camera className="size-4" />} onClick={() => setWizard(true)}>Re-run photo onboarding</Button>} />

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader title="Profile" subtitle={`${known.length} facts · ${confirmed.length} confirmed or learned from records`} />
          <ul className="divide-y divide-beige-200">{p.fields.map((f) => <FieldRow key={f.key} f={f} />)}</ul>
        </Card>
        <div className="space-y-6">
          <Card className="p-5">
            <div className="flex items-center justify-between"><p className="text-sm font-semibold">Profile confidence</p><span className="text-sm font-semibold text-cobalt">{pct(completeness)}</span></div>
            <div className="mt-2"><ProgressBar value={completeness} /></div>
            <p className="mt-2 text-xs text-ink-500">Share of facts confirmed by you or learned from documents. Photo-only inferences don’t count until confirmed.</p>
            <div className="mt-4 border-t border-beige-200 pt-4">
              <Field label="GST registration type" hint="The Workflow Builder plans differently: composition dealers skip ITC matching.">
                <Select value={p.registrationType} onChange={(e) => setRegistrationType(e.target.value as 'regular' | 'composition')} aria-label="Registration type">
                  <option value="regular">Regular (monthly returns, ITC)</option><option value="composition">Composition scheme (no ITC)</option>
                </Select>
              </Field>
            </div>
          </Card>
          <Card>
            <CardHeader title="How this understanding was built" />
            <ol className="space-y-4 p-5">
              {[
                [Camera, 'Workshop photograph', p.photoAnalysedAt ? `Analysed ${fmtDate(p.photoAnalysedAt)}: likely metal-machining unit` : 'Not analysed'],
                [MessageSquareText, 'Owner conversation', 'GSTIN, legal name, turnover band, filing frequency'],
                [FileText, 'Purchase invoices', `${s.invoices.length} invoices → suppliers, typical inputs`],
                [ShieldCheck, 'Dispatch & sales records', `${s.shipments.length} shipments → customers, e-way bill pattern`],
              ].map(([I, t, d], i) => {
                const Icon = I as typeof Camera;
                return <li key={i} className="flex gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-cobalt-50 text-cobalt"><Icon className="size-4" /></span><div><p className="text-sm font-medium">{t as string}</p><p className="text-xs text-ink-500">{d as string}</p></div></li>;
              })}
            </ol>
          </Card>
          <Card className="bg-ink p-5 text-white">
            <div className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="size-4 text-sun" /> Context in action</div>
            <p className="mt-2 text-[13px] leading-relaxed text-white/75">When a steel invoice arrives, agents already know this is a raw-material purchase for a regular GST registrant in Maharashtra. CGST + SGST is expected from Pune suppliers, IGST from out-of-state ones, and ITC must be matched against supplier filings.</p>
          </Card>
        </div>
      </div>
      {wizard && <OnboardingWizard onClose={() => setWizard(false)} />}
    </div>
  );
}

function FieldRow({ f }: { f: ProfileField }) {
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState(f.value);
  const [label, tone, Icon] = SOURCE[f.source];
  const isGstin = f.key === 'gstin';
  const gst = isGstin ? validateGstin(v) : { valid: true };
  useEffect(() => setV(f.value), [f.value]);
  return (
    <li className="flex flex-col gap-2 px-5 py-3.5 sm:flex-row sm:items-start">
      <div className="w-44 shrink-0 text-xs font-medium text-ink-500 sm:pt-0.5">{f.label}</div>
      <div className="min-w-0 flex-1">
        {edit ? (
          <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); if (!gst.valid || !v.trim()) return; updateProfileField(f.key, v.trim()); setEdit(false); }}>
            <div className="flex-1"><Input value={v} onChange={(e) => setV(e.target.value)} invalid={!gst.valid} autoFocus aria-label={f.label} />{!gst.valid && <p className="mt-1 text-xs text-bad">{(gst as { reason?: string }).reason}</p>}</div>
            <div className="flex gap-2"><Button size="sm" type="submit" disabled={!gst.valid || !v.trim()}>Save</Button><Button size="sm" variant="ghost" type="button" onClick={() => { setV(f.value); setEdit(false); }}>Cancel</Button></div>
          </form>
        ) : (
          <p className={cx('text-sm break-words', f.source === 'missing' ? 'text-ink-400 italic' : 'text-ink')}>{f.value}</p>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Badge tone={tone}><Icon className="size-3" />{label}{f.confidence && f.source === 'photo_inferred' ? ` · ${pct(f.confidence)}` : ''}</Badge>
          {f.note && <span className="text-[11px] text-ink-400">{f.note}</span>}
        </div>
      </div>
      {!edit && (
        <div className="flex gap-1">
          {f.source === 'photo_inferred' && <Button size="sm" variant="secondary" icon={<Check className="size-3.5" />} onClick={() => updateProfileField(f.key, f.value)}>Confirm</Button>}
          <Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={() => setEdit(true)} aria-label={`Edit ${f.label}`}>Edit</Button>
        </div>
      )}
    </li>
  );
}

type Step = 'upload' | 'analysing' | 'review';

function OnboardingWizard({ onClose }: { onClose: () => void }) {
  const s = useAppState();
  const [step, setStep] = useState<Step>('upload');
  const [img, setImg] = useState<string>('/samples/workshop.svg');
  const [analysis, setAnalysis] = useState<PhotoAnalysis | null>(null);
  const [accepted, setAccepted] = useState<Record<string, boolean>>({});
  const [ans, setAns] = useState<OnboardingAnswers>({ legalName: s.profile.businessName, ownerName: s.profile.ownerName, gstin: s.profile.gstin, suppliers: '', turnover: '₹40 lakh – ₹1.5 crore' });
  const [error, setError] = useState<string | null>(null);
  const gst = validateGstin(ans.gstin);

  useEffect(() => () => { if (img.startsWith('blob:')) URL.revokeObjectURL(img); }, [img]);

  const start = async (file: File | null) => {
    setError(null);
    if (file) {
      if (!file.type.startsWith('image/')) { setError('Please choose an image (JPG, PNG or WEBP).'); return; }
      if (file.size > 10 * 1024 * 1024) { setError('Image is larger than 10 MB.'); return; }
      setImg(URL.createObjectURL(file));
    } else setImg('/samples/workshop.svg');
    setStep('analysing');
    const r = await analysePhoto(file);
    setAnalysis(r);
    setAccepted(Object.fromEntries(r.fields.map((f) => [f.key, f.confidence >= 0.8])));
    setStep('review');
  };

  return (
    <Modal open onClose={onClose} size="xl" title="Understand your business from a photo" subtitle={step === 'upload' ? 'Step 1 of 3 · Upload a photo of your shop, workshop or products' : step === 'analysing' ? 'Step 2 of 3 · Visual understanding' : 'Step 3 of 3 · Confirm and fill in only what a photo can’t show'}
      footer={step === 'review' ? <>
        <Button variant="secondary" onClick={() => setStep('upload')}>Use another photo</Button>
        <Button disabled={!gst.valid || !ans.legalName.trim()} onClick={() => { if (analysis && confirmProfile(analysis, accepted, ans)) onClose(); }}>Save business profile</Button>
      </> : undefined}>
      {step === 'upload' && (
        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <Dropzone accept=".jpg,.jpeg,.png,.webp" title="Drop a business photo" hint="JPG, PNG or WEBP · stays in your browser" onFiles={(f) => void start(f[0])} icon={<Camera className="size-5" />} />
            {error && <p className="mt-2 text-sm text-bad" role="alert">{error}</p>}
            <p className="mt-3 text-xs text-ink-400">Demo mode: analysis uses a local mock provider. Any photo produces the same sample result, a metal-machining workshop.</p>
          </div>
          <button onClick={() => void start(null)} className="group overflow-hidden rounded-2xl border border-beige-200 text-left hover:border-cobalt/40" data-action="sample-photo">
            <img src="/samples/workshop.svg" alt="Sample workshop" className="aspect-[16/10] w-full object-cover transition group-hover:scale-[1.02]" />
            <div className="p-3"><p className="text-sm font-semibold">Use sample workshop photo</p><p className="text-xs text-ink-500">Small machining unit in Pune</p></div>
          </button>
        </div>
      )}
      {step === 'analysing' && (
        <div className="grid items-center gap-6 md:grid-cols-2">
          <div className="relative overflow-hidden rounded-2xl">
            <img src={img} alt="Photo being analysed" className="aspect-[16/10] w-full object-cover" />
            <div className="absolute inset-0 bg-cobalt/10" />
            <div className="absolute inset-x-0 h-1/3 animate-[scan_1.6s_ease-in-out_infinite] bg-gradient-to-b from-transparent via-sun/40 to-transparent" />
            <style>{'@keyframes scan{0%{top:-33%}100%{top:100%}}'}</style>
          </div>
          <div className="space-y-3">
            {['Detecting equipment and layout', 'Recognising materials and products', 'Estimating type of business', 'Listing what can’t be known from a photo'].map((t, i) => (
              <div key={t} className="flex items-center gap-3 animate-fade-up" style={{ animationDelay: `${i * 450}ms` }}><ScanSearch className="size-4 text-cobalt" /><span className="text-sm text-ink-700">{t}</span></div>
            ))}
          </div>
        </div>
      )}
      {step === 'review' && analysis && (
        <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
          <div>
            <img src={img} alt="Analysed business" className="aspect-[16/10] w-full rounded-2xl object-cover" />
            <p className="mt-3 rounded-2xl bg-cobalt-50 p-3 text-sm text-cobalt-800">{analysis.summary}</p>
          </div>
          <div className="space-y-6">
            <div>
              <p className="label-mono mb-2">Inferred from the photo · tick what is correct</p>
              <ul className="space-y-2">
                {analysis.fields.map((f) => (
                  <li key={f.key}>
                    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-beige-200 p-3 hover:bg-beige-50">
                      <input type="checkbox" className="mt-1 size-4 accent-cobalt" checked={!!accepted[f.key]} onChange={(e) => setAccepted({ ...accepted, [f.key]: e.target.checked })} />
                      <span className="min-w-0 flex-1"><span className="block text-xs text-ink-400">{f.label}</span><span className="block text-sm font-medium">{f.value}</span></span>
                      <span className="w-20 shrink-0 text-right"><span className="text-xs font-semibold text-ink-500">{pct(f.confidence)}</span><ProgressBar value={f.confidence} tone={f.confidence >= 0.8 ? 'ok' : 'sun'} /></span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="label-mono mb-2">Only what a photo can’t tell</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Legal business name" htmlFor="ob-name" error={!ans.legalName.trim() ? 'Required' : undefined}><Input id="ob-name" value={ans.legalName} onChange={(e) => setAns({ ...ans, legalName: e.target.value })} /></Field>
                <Field label="Owner name" htmlFor="ob-owner"><Input id="ob-owner" value={ans.ownerName} onChange={(e) => setAns({ ...ans, ownerName: e.target.value })} /></Field>
                <Field label="GSTIN" htmlFor="ob-gstin" error={!gst.valid ? gst.reason : undefined} hint="Checked for format and checksum only (no GSTN lookup in demo mode)"><Input id="ob-gstin" value={ans.gstin} onChange={(e) => setAns({ ...ans, gstin: e.target.value.toUpperCase() })} invalid={!gst.valid} className="font-mono" /></Field>
                <Field label="Annual turnover band" htmlFor="ob-turn"><Select id="ob-turn" value={ans.turnover} onChange={(e) => setAns({ ...ans, turnover: e.target.value })}>{['Below ₹40 lakh', '₹40 lakh – ₹1.5 crore', '₹1.5 crore – ₹5 crore', 'Above ₹5 crore'].map((x) => <option key={x}>{x}</option>)}</Select></Field>
                <div className="sm:col-span-2"><Field label="Main suppliers (optional)" htmlFor="ob-sup" hint="Leave empty: YUKTIDOOT will learn them from your invoices"><Input id="ob-sup" value={ans.suppliers} onChange={(e) => setAns({ ...ans, suppliers: e.target.value })} placeholder="e.g. Shree Ganesh Steel Traders, Deccan Tools" /></Field></div>
              </div>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
