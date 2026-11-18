import { useSyncExternalStore } from 'react';
import { uid } from '@/lib/util';

export type ToastKind = 'success' | 'error' | 'info' | 'warning';
export interface Toast { id: string; kind: ToastKind; title: string; body?: string; action?: { label: string; to: string } }

let toasts: Toast[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function toast(kind: ToastKind, title: string, body?: string, action?: Toast['action']) {
  const t = { id: uid('t'), kind, title, body, action };
  toasts = [...toasts.slice(-3), t];
  emit();
  setTimeout(() => dismissToast(t.id), kind === 'error' ? 8000 : 5000);
}
export function dismissToast(id: string) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}
export function useToasts() {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    () => toasts,
    () => toasts,
  );
}
