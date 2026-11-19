export const pad = (n: number): string => String(n).padStart(2, '0');

export function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
}

export function addMonths(d: Date, n: number): Date {
  const day = d.getDate();
  const x = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const last = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate();
  x.setDate(Math.min(day, last));
  return x;
}

/** Weeks start on Monday. */
export function startOfWeek(d: Date): Date {
  return addDays(d, -((d.getDay() + 6) % 7));
}

export function endOfWeek(d: Date): Date {
  return addDays(startOfWeek(d), 6);
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

/** 6 weeks x 7 days grid (Monday first) covering the month of `d`. */
export function monthGrid(d: Date): Date[] {
  const start = startOfWeek(startOfMonth(d));
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export function nextOccurrence(iso: string, repeat: 'none' | 'daily' | 'weekly' | 'monthly'): string {
  const d = fromISO(iso);
  switch (repeat) {
    case 'daily':
      return toISO(addDays(d, 1));
    case 'weekly':
      return toISO(addDays(d, 7));
    case 'monthly':
      return toISO(addMonths(d, 1));
    default:
      return iso;
  }
}

/** Epoch ms of a task's due moment. All-day tasks are due at the end of the day. */
export function dueTimestamp(dueDate: string, dueTime: string | null): number {
  const [y, m, d] = dueDate.split('-').map(Number);
  const [hh, mm] = (dueTime ?? '23:59').split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm).getTime();
}

export function formatLongDate(d: Date): string {
  return new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
}

export function formatMonthYear(d: Date): string {
  return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(d);
}

export function formatShort(iso: string): string {
  return new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' }).format(
    fromISO(iso),
  );
}

export function weekdayShort(d: Date): string {
  return new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(d);
}

export function monthShort(d: Date): string {
  return new Intl.DateTimeFormat(undefined, { month: 'short' }).format(d);
}

/** "Today", "Tomorrow", "Yesterday" or a short date. */
export function relativeDay(iso: string, todayIso: string): string {
  const diff = Math.round((fromISO(iso).getTime() - fromISO(todayIso).getTime()) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return formatShort(iso);
}
