// Dispatch & e-way bill rule checks (deterministic, simplified).
// Simplifications: a single ₹50,000 consignment threshold (some states use different intra-state limits),
// road transport only, regular cargo validity. Not legal advice.
import type { DispatchIssue, DispatchValidation, Shipment } from '@/types';
import { EWAY_THRESHOLD, ewayValidityDays, validateGstin, validateVehicleNumber } from '@/lib/gst';

export function validateShipment(s: Shipment, now = new Date().toISOString()): DispatchValidation {
  const issues: DispatchIssue[] = [];
  const ewayRequired = s.value > EWAY_THRESHOLD;

  const g = validateGstin(s.consigneeGstin);
  if (!g.valid) issues.push({ code: 'CONSIGNEE_GSTIN', severity: 'block', field: 'consigneeGstin', message: `Consignee GSTIN: ${g.reason}.` });
  if (!/^[0-9]{4,8}$/.test(s.hsn)) issues.push({ code: 'HSN', severity: 'block', field: 'hsn', message: 'HSN code must have 4 to 8 digits.' });
  if (!(s.value > 0)) issues.push({ code: 'VALUE', severity: 'block', field: 'value', message: 'Consignment value must be greater than zero.' });
  if (!(s.distanceKm > 0) || s.distanceKm > 4000) issues.push({ code: 'DISTANCE', severity: 'block', field: 'distanceKm', message: 'Approximate distance must be between 1 and 4,000 km.' });
  if (!/^[1-9][0-9]{5}$/.test(s.toPin)) issues.push({ code: 'PIN', severity: 'block', field: 'toPin', message: 'Destination PIN code must be 6 digits.' });

  if (ewayRequired) {
    const v = validateVehicleNumber(s.vehicleNumber);
    if (!v.valid) {
      issues.push({
        code: s.vehicleNumber.trim() ? 'VEHICLE_FORMAT' : 'VEHICLE_MISSING',
        severity: 'block',
        field: 'vehicleNumber',
        message: s.vehicleNumber.trim()
          ? `Vehicle number "${s.vehicleNumber}" is not a valid registration format.`
          : 'Vehicle number is missing. Part-B of the e-way bill cannot be completed, so the goods cannot move.',
      });
    }
    if (!s.transporterId.trim()) issues.push({ code: 'TRANSPORTER', severity: 'warn', field: 'transporterId', message: 'No transporter ID. Fine for own vehicle; required if a transporter carries the goods.' });
  }

  return {
    canMove: !issues.some((i) => i.severity === 'block'),
    ewayRequired,
    validityDays: ewayValidityDays(s.distanceKm || 0),
    issues,
    checkedAt: now,
  };
}
