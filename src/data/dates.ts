// All demo dates are relative to "today" so deadlines stay realistic whenever the demo runs.
const pad = (n: number) => String(n).padStart(2, '0');

export function monthsAgo(n: number, now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth() - n, 1);
}
export function periodOf(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
/** ISO date (noon local, avoids timezone day-shift) for day `day` of the month `n` months ago. */
export function dayIn(n: number, day: number, now = new Date()) {
  const m = monthsAgo(n, now);
  return new Date(m.getFullYear(), m.getMonth(), day, 12).toISOString();
}
export const currentPeriod = () => periodOf(monthsAgo(0));
export const previousPeriod = () => periodOf(monthsAgo(1));
export function hoursAgo(h: number) {
  return new Date(Date.now() - h * 3600_000).toISOString();
}
