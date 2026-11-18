import { makeGstin } from '@/lib/gst';
import type { Supplier } from '@/types';

export const OWN_GSTIN = makeGstin('27ABKFS4821M1Z');

export const SUPPLIERS: Supplier[] = [
  { id: 'sup_ganesh', name: 'Shree Ganesh Steel Traders', gstin: makeGstin('27AAJFS7731K1Z'), city: 'Bhosari, Pune', stateCode: '27', email: 'accounts@ganeshsteel.example', phone: '+91 98220 41xxx', category: 'Raw material · steel' },
  { id: 'sup_patel', name: 'Patel Packaging Industries', gstin: makeGstin('24AACCP5528L1Z'), city: 'Ahmedabad', stateCode: '24', email: 'billing@patelpack.example', phone: '+91 79 2583 xxxx', category: 'Packaging' },
  { id: 'sup_kaveri', name: 'Kaveri Lubricants Pvt Ltd', gstin: makeGstin('29AAFCK3190Q1Z'), city: 'Bengaluru', stateCode: '29', email: 'gst@kaverilubes.example', phone: '+91 80 4112 xxxx', category: 'Consumables · oils' },
  { id: 'sup_deccan', name: 'Deccan Tools & Hardware', gstin: makeGstin('27AAGFD2207H1Z'), city: 'Pune', stateCode: '27', email: 'sales@deccantools.example', phone: '+91 20 2712 xxxx', category: 'Tooling' },
  { id: 'sup_ajanta', name: 'Ajanta Electricals', gstin: makeGstin('27ABEPA6612R1Z'), city: 'Nashik', stateCode: '27', email: 'ajanta.elec@example.com', phone: '+91 94220 18xxx', category: 'Electricals' },
];

export const CUSTOMERS = [
  { name: 'Bharat Auto Components Pvt Ltd', gstin: makeGstin('27AADCB4410E1Z'), city: 'Chakan, Pune', pin: '410501', km: 32 },
  { name: 'Omkar Engineering Works', gstin: makeGstin('27AAKFO9031B1Z'), city: 'Kolhapur', pin: '416234', km: 232 },
  { name: 'Sai Fabricators', gstin: makeGstin('27BCSPS7720D1Z'), city: 'Hadapsar, Pune', pin: '411028', km: 14 },
];

export const OWN_PIN = '411026';
