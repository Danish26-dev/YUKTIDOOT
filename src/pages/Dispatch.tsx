import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, MapPin, Plus, ShieldX, Truck, XCircle } from 'lucide-react';
import type { Shipment } from '@/types';
import { useAppState } from '@/store/store';
import { createShipment, updateShipment, validateDispatch } from '@/store/actions';
import { Badge, Button, Card, EmptyState, Field, Input, PageHeader, Select, Tabs } from '@/components/ui/primitives';
import { Drawer, Modal } from '@/components/ui/overlays';
import { ShipmentStatusBadge } from '@/components/domain/status';
import { RunTimeline } from '@/components/domain/RunTimeline';
import { CUSTOMERS } from '@/data/parties';
import { EWAY_THRESHOLD, ewayValidityDays, validateGstin, validateVehicleNumber } from '@/lib/gst';
import { inr, relTime } from '@/lib/format';
import { useQueryParam } from '@/lib/useQueryParam';
import { cx } from '@/lib/util';

type Filter = 'all' | 'action' | 'done';

export function DispatchPage() {
  const s = useAppState();
  const [openId, setOpen] = useQueryParam('open');
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const rows = useMemo(() => s.shipments.filter((x) => filter === 'all' ? true : filter === 'action' ? ['draft', 'blocked', 'awaiting_approval'].includes(x.status) : ['eway_generated', 'not_required'].includes(x.status)), [s.shipments, filter]);
  const open = s.shipments.find((x) => x.id === openId);

  return (
    <div>
      <PageHeader eyebrow="Dispatch & E-way Bill Agent" title="Dispatch & e-way bills" description="Every shipment is checked before goods move. If something statutory is missing, the shipment is blocked, not guessed."
        actions={<Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>New shipment</Button>} />

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <Rule icon={<Truck className="size-4" />} title="Applicability" body={`E-way bill required when consignment value exceeds ${inr(EWAY_THRESHOLD)} (simplified; some states differ for intra-state moves).`} />
        <Rule icon={<ShieldX className="size-4" />} title="Part-B gate" body="Road movement without a valid vehicle number is blocked. Goods cannot move until Part-B is complete." />
        <Rule icon={<MapPin className="size-4" />} title="Validity" body="1 day per 200 km or part of it, for regular cargo. Recomputed independently before approval." />
      </div>

      <Card>
        <div className="border-b border-beige-200 p-4">
          <Tabs value={filter} onChange={setFilter} items={[{ value: 'all', label: 'All', count: s.shipments.length }, { value: 'action', label: 'Needs action', count: s.shipments.filter((x) => ['draft', 'blocked', 'awaiting_approval'].includes(x.status)).length }, { value: 'done', label: 'Ready to move' }]} />
        </div>
        {rows.length === 0 ? <EmptyState icon={<Truck className="size-5" />} title="No shipments here" body="Create a shipment to validate it before dispatch." action={<Button onClick={() => setCreating(true)}>New shipment</Button>} /> : (
          <ul className="divide-y divide-beige-200">
            {rows.map((x) => (
              <li key={x.id}>
                <button onClick={() => setOpen(x.id)} className="flex w-full flex-col gap-3 px-5 py-4 text-left hover:bg-beige-50 md:flex-row md:items-center" data-shipment={x.id}>
                  <span className={cx('grid size-10 shrink-0 place-items-center rounded-xl', x.status === 'blocked' ? 'bg-bad-50 text-bad' : x.status === 'eway_generated' || x.status === 'not_required' ? 'bg-ok-50 text-ok' : 'bg-cobalt-50 text-cobalt')}><Truck className="size-5" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{x.id}</span><ShipmentStatusBadge status={x.status} /></div>
                    <p className="truncate text-sm text-ink-500">{x.consignee} · {x.toCity} · {x.goods}</p>
                  </div>
                  <div className="grid grid-cols-3 gap-6 text-sm md:w-[380px]">
                    <div><div className="text-[11px] text-ink-400">Value</div><div className="font-medium tabular-nums">{inr(x.value)}</div></div>
                    <div><div className="text-[11px] text-ink-400">Distance</div><div className="font-medium">{x.distanceKm} km</div></div>
                    <div><div className="text-[11px] text-ink-400">Vehicle</div><div className={cx('font-mono text-[13px]', !x.vehicleNumber && 'text-bad')}>{x.vehicleNumber || 'missing'}</div></div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {open && <ShipmentDrawer key={open.id} shipment={open} onClose={() => setOpen(null)} />}
      {creating && <NewShipment onClose={(id) => { setCreating(false); if (id) setOpen(id); }} />}
    </div>
  );
}

const Rule = ({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) => (
  <Card className="p-4"><div className="flex items-center gap-2 text-sm font-semibold"><span className="text-cobalt">{icon}</span>{title}</div><p className="mt-1 text-xs text-ink-500">{body}</p></Card>
);

function ShipmentDrawer({ shipment: x, onClose }: { shipment: Shipment; onClose: () => void }) {
  const s = useAppState();
  const run = s.runs.find((r) => r.id === x.workflowRunId);
  const busy = !!run && ['planning', 'running'].includes(run.status);
  const locked = x.status === 'eway_generated';
  const [vehicle, setVehicle] = useState(x.vehicleNumber);
  const [transporter, setTransporter] = useState(x.transporterId);
  const [distance, setDistance] = useState(String(x.distanceKm));
  const vehicleRef = useRef<HTMLInputElement>(null);
  const pendingApproval = s.approvals.find((a) => a.kind === 'eway_bill' && a.refId === x.id && a.status === 'pending');

  useEffect(() => { setVehicle(x.vehicleNumber); setTransporter(x.transporterId); setDistance(String(x.distanceKm)); }, [x.vehicleNumber, x.transporterId, x.distanceKm]);
  useEffect(() => { if (x.status === 'blocked') vehicleRef.current?.focus(); }, [x.status]);

  const vehicleIssue = x.validation?.issues.find((i) => i.field === 'vehicleNumber' && i.severity === 'block');
  const vCheck = vehicle.trim() ? validateVehicleNumber(vehicle) : null;
  const dirty = vehicle !== x.vehicleNumber || transporter !== x.transporterId || distance !== String(x.distanceKm);
  const distanceNum = Number(distance);

  const saveAndValidate = async () => {
    if (dirty) updateShipment(x.id, { vehicleNumber: vehicle.replace(/[\s-]/g, '').toUpperCase(), transporterId: transporter.trim(), distanceKm: distanceNum });
    await validateDispatch(x.id);
  };

  return (
    <Drawer open onClose={onClose} title={`Shipment ${x.id}`} subtitle={<span className="flex flex-wrap items-center gap-2">{x.consignee}<ShipmentStatusBadge status={x.status} /></span>}
      footer={<>
        {pendingApproval && <Link to={`/approvals?focus=${pendingApproval.id}`}><Button variant="sun">Review approval</Button></Link>}
        {!locked && (!pendingApproval || dirty) && <Button loading={busy} disabled={busy || (!!vehicle.trim() && !vCheck?.valid) || !(distanceNum > 0)} onClick={() => void saveAndValidate()} data-action="validate">{dirty ? 'Save & validate' : x.status === 'blocked' ? 'Validate again' : 'Validate & prepare e-way bill'}</Button>}
        <Button variant="secondary" onClick={onClose}>Close</Button>
      </>}>
      <div className="space-y-6">
        {x.status === 'blocked' && (
          <div className="flex gap-3 rounded-2xl border border-bad/30 bg-bad-50 p-4" role="alert">
            <ShieldX className="mt-0.5 size-5 shrink-0 text-bad" />
            <div className="text-sm"><p className="font-semibold text-bad">Shipment blocked: goods must not move</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-ink-700">{x.validation?.issues.filter((i) => i.severity === 'block').map((i) => <li key={i.code}>{i.message}</li>)}</ul>
              <p className="mt-2 text-xs text-ink-500">Fix the highlighted fields below, then validate again.</p></div>
          </div>
        )}
        {x.status === 'eway_generated' && (
          <div className="flex gap-3 rounded-2xl bg-ok-50 p-4"><CheckCircle2 className="mt-0.5 size-5 shrink-0 text-ok" />
            <div className="text-sm"><p className="font-semibold text-ok">Ready to move</p><p className="text-ink-700">E-way bill <span className="font-mono">{x.ewbNumber}</span> · valid {x.validation?.validityDays ?? ewayValidityDays(x.distanceKm)} day(s)</p><p className="mt-1 text-xs text-ink-500">Simulated number. Not registered on the e-way bill portal.</p></div></div>
        )}
        {x.status === 'not_required' && <div className="rounded-2xl bg-ok-50 p-4 text-sm text-ok">Value {inr(x.value)} is within {inr(EWAY_THRESHOLD)}: no e-way bill needed. Goods can move with the tax invoice.</div>}

        <section className="card p-5">
          <h3 className="mb-4 text-sm font-semibold">Transport details (Part-B)</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Vehicle number" htmlFor="veh" error={vehicle.trim() && vCheck && !vCheck.valid ? vCheck.reason : !vehicle.trim() && vehicleIssue ? 'Required to move goods by road' : undefined} hint="e.g. MH12AB4521">
              <Input id="veh" ref={vehicleRef} value={vehicle} disabled={locked || busy} onChange={(e) => setVehicle(e.target.value.toUpperCase())} invalid={(!!vehicleIssue && !vehicle.trim()) || (!!vCheck && !vCheck.valid)} placeholder="Not provided" className="font-mono" />
            </Field>
            <Field label="Transporter ID (optional)" htmlFor="tid" hint="Only if a transporter carries the goods">
              <Input id="tid" value={transporter} disabled={locked || busy} onChange={(e) => setTransporter(e.target.value.toUpperCase())} className="font-mono" />
            </Field>
            <Field label="Approx. distance (km)" htmlFor="dist" error={!(distanceNum > 0) ? 'Enter a distance' : undefined}>
              <Input id="dist" type="number" min={1} value={distance} disabled={locked || busy} onChange={(e) => setDistance(e.target.value)} />
            </Field>
            <Field label="Validity (computed)"><div className="input bg-beige-50">{distanceNum > 0 ? `${ewayValidityDays(distanceNum)} day(s)` : '—'}</div></Field>
          </div>
        </section>

        <section className="card p-5">
          <h3 className="mb-3 text-sm font-semibold">Consignment (Part-A)</h3>
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            {[['Tax invoice', x.invoiceNumber], ['Consignee', x.consignee], ['Consignee GSTIN', x.consigneeGstin], ['Destination', `${x.toCity} · ${x.toPin}`], ['Goods', x.goods], ['HSN', x.hsn], ['Value', inr(x.value)], ['Created', relTime(x.createdAt)]].map(([k, v]) => (
              <div key={k}><dt className="text-[11px] text-ink-400">{k}</dt><dd className="font-medium break-words">{v}</dd></div>
            ))}
          </dl>
        </section>

        {x.validation && (
          <section className="card p-5">
            <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold">Rule checks</h3><Badge tone={x.validation.canMove ? 'ok' : 'bad'}>{x.validation.canMove ? 'Can move' : 'Blocked'}</Badge></div>
            {x.validation.issues.length === 0 ? <p className="text-sm text-ok">All dispatch rules satisfied.</p> : (
              <ul className="space-y-2">{x.validation.issues.map((i) => (
                <li key={i.code} className="flex gap-2 rounded-xl bg-beige-50 px-3 py-2 text-sm">{i.severity === 'block' ? <XCircle className="mt-0.5 size-4 shrink-0 text-bad" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0 text-sun-700" />}<span>{i.message}</span></li>
              ))}</ul>
            )}
          </section>
        )}
        {run && <section className="card p-5"><h3 className="mb-3 text-sm font-semibold">Workflow</h3><RunTimeline run={run} /></section>}
      </div>
    </Drawer>
  );
}

function NewShipment({ onClose }: { onClose: (id?: string) => void }) {
  const [c, setC] = useState(0);
  const cust = CUSTOMERS[c];
  const [f, setF] = useState({ invoiceNumber: 'SPW/26-27/0231', goods: 'Machined shafts', hsn: '8483', value: '96000', vehicleNumber: '', transporterId: '', distanceKm: String(cust.km), toPin: cust.pin, consigneeGstin: cust.gstin });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const gst = validateGstin(f.consigneeGstin);
  const veh = f.vehicleNumber.trim() ? validateVehicleNumber(f.vehicleNumber) : null;
  const valid = f.invoiceNumber.trim() && f.goods.trim() && Number(f.value) > 0 && Number(f.distanceKm) > 0 && gst.valid && (!veh || veh.valid);
  return (
    <Modal open onClose={() => onClose()} title="New shipment" subtitle="You can leave the vehicle number empty. Validation will block the shipment until it is added." size="lg"
      footer={<><Button variant="secondary" onClick={() => onClose()}>Cancel</Button><Button disabled={!valid} onClick={() => onClose(createShipment({
        invoiceNumber: f.invoiceNumber.trim(), consignee: cust.name, consigneeGstin: f.consigneeGstin.trim().toUpperCase(), toCity: cust.city, toPin: f.toPin, distanceKm: Number(f.distanceKm), value: Number(f.value), hsn: f.hsn.trim(), goods: f.goods.trim(), vehicleNumber: f.vehicleNumber.replace(/[\s-]/g, '').toUpperCase(), transporterId: f.transporterId.trim(),
      }))}>Create shipment</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Consignee" htmlFor="ns-c"><Select id="ns-c" value={c} onChange={(e) => { const i = Number(e.target.value); setC(i); setF({ ...f, distanceKm: String(CUSTOMERS[i].km), toPin: CUSTOMERS[i].pin, consigneeGstin: CUSTOMERS[i].gstin }); }}>{CUSTOMERS.map((x, i) => <option key={x.name} value={i}>{x.name} · {x.city}</option>)}</Select></Field>
        <Field label="Consignee GSTIN" htmlFor="ns-g" error={!gst.valid ? gst.reason : undefined}><Input id="ns-g" value={f.consigneeGstin} onChange={set('consigneeGstin')} invalid={!gst.valid} className="font-mono" /></Field>
        <Field label="Tax invoice number" htmlFor="ns-i"><Input id="ns-i" value={f.invoiceNumber} onChange={set('invoiceNumber')} /></Field>
        <Field label="Goods" htmlFor="ns-goods"><Input id="ns-goods" value={f.goods} onChange={set('goods')} /></Field>
        <Field label="HSN" htmlFor="ns-h"><Input id="ns-h" value={f.hsn} onChange={set('hsn')} className="font-mono" /></Field>
        <Field label="Consignment value (₹)" htmlFor="ns-v" hint={Number(f.value) > EWAY_THRESHOLD ? 'E-way bill will be required' : 'Below threshold'}><Input id="ns-v" type="number" min={1} value={f.value} onChange={set('value')} /></Field>
        <Field label="Distance (km)" htmlFor="ns-d"><Input id="ns-d" type="number" min={1} value={f.distanceKm} onChange={set('distanceKm')} /></Field>
        <Field label="Destination PIN" htmlFor="ns-p"><Input id="ns-p" value={f.toPin} onChange={set('toPin')} className="font-mono" /></Field>
        <Field label="Vehicle number" htmlFor="ns-veh" error={veh && !veh.valid ? veh.reason : undefined} hint="Optional now; required before goods move"><Input id="ns-veh" value={f.vehicleNumber} onChange={set('vehicleNumber')} invalid={!!veh && !veh.valid} className="font-mono" /></Field>
        <Field label="Transporter ID" htmlFor="ns-t"><Input id="ns-t" value={f.transporterId} onChange={set('transporterId')} className="font-mono" /></Field>
      </div>
    </Modal>
  );
}
