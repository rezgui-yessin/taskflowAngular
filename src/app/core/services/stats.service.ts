import { Injectable, computed, inject } from '@angular/core';
import { TaskStore } from './task.store';
import { Task } from '../models/task.model';
import {
  addDays, addMonths, endOfMonth, endOfWeek, fromISO, monthShort, startOfMonth, startOfWeek, toISO, weekdayShort,
} from '../utils/date.utils';

export interface Summary { total: number; done: number; pct: number; }
export interface Bucket { label: string; total: number; done: number; pct: number; isCurrent: boolean; }

const summarize = (tasks: Task[]): Summary => {
  const done = tasks.filter((t) => t.status === 'done').length;
  return { total: tasks.length, done, pct: tasks.length ? Math.round((done / tasks.length) * 100) : 0 };
};

@Injectable({ providedIn: 'root' })
export class StatsService {
  private readonly store = inject(TaskStore);

  private range(from: Date, to: Date): Task[] {
    return this.store.forRange(toISO(from), toISO(to));
  }

  readonly day = computed<Summary>(() => summarize(this.store.forDate(this.store.today())));
  readonly week = computed<Summary>(() => {
    const ref = fromISO(this.store.today());
    return summarize(this.range(startOfWeek(ref), endOfWeek(ref)));
  });
  readonly month = computed<Summary>(() => {
    const ref = fromISO(this.store.today());
    return summarize(this.range(startOfMonth(ref), endOfMonth(ref)));
  });

  /** Last 7 days, ending today. */
  readonly last7 = computed<Bucket[]>(() => {
    const today = fromISO(this.store.today());
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(today, i - 6);
      return { label: weekdayShort(d), isCurrent: i === 6, ...summarize(this.range(d, d)) };
    });
  });

  /** Last 6 weeks, ending with the current one. */
  readonly last6Weeks = computed<Bucket[]>(() => {
    const monday = startOfWeek(fromISO(this.store.today()));
    return Array.from({ length: 6 }, (_, i) => {
      const s = addDays(monday, (i - 5) * 7);
      return { label: `${s.getDate()} ${monthShort(s)}`, isCurrent: i === 5, ...summarize(this.range(s, addDays(s, 6))) };
    });
  });

  /** Last 6 months, ending with the current one. */
  readonly last6Months = computed<Bucket[]>(() => {
    const first = startOfMonth(fromISO(this.store.today()));
    return Array.from({ length: 6 }, (_, i) => {
      const s = addMonths(first, i - 5);
      return { label: monthShort(s), isCurrent: i === 5, ...summarize(this.range(s, endOfMonth(s))) };
    });
  });

  /** Consecutive days with at least one completed task. Today doesn't break the streak until it ends. */
  readonly streak = computed(() => {
    const days = new Set(
      this.store.tasks().filter((t) => t.completedAt).map((t) => toISO(new Date(t.completedAt as string))),
    );
    let cursor = fromISO(this.store.today());
    if (!days.has(toISO(cursor))) cursor = addDays(cursor, -1);
    let n = 0;
    while (days.has(toISO(cursor))) { n++; cursor = addDays(cursor, -1); }
    return n;
  });

  readonly completedTotal = computed(() => this.store.tasks().filter((t) => t.status === 'done').length);

  /** This month's tasks grouped by category. */
  readonly byCategory = computed(() => {
    const ref = fromISO(this.store.today());
    const map = new Map<string, Summary>();
    const tasks = this.range(startOfMonth(ref), endOfMonth(ref));
    for (const name of new Set(tasks.map((t) => t.category))) {
      map.set(name, summarize(tasks.filter((t) => t.category === name)));
    }
    return [...map.entries()].map(([name, s]) => ({ name, ...s })).sort((a, b) => b.total - a.total);
  });
}
