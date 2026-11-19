import { Injectable, computed, inject } from '@angular/core';
import { TaskStore } from './task.store';
import { Task } from '../models/task.model';
import {
  addDays, addMonths, endOfMonth, endOfWeek, fromISO, monthShort, startOfMonth, startOfWeek, toISO, weekdayShort,
} from '../utils/date.utils';

export interface Summary { total: number; done: number; pct: number; minutesSpent: number; }
export interface Bucket { label: string; total: number; done: number; pct: number; isCurrent: boolean; minutesSpent: number; }

export interface WeeklyReview {
  startDate: string;
  endDate: string;
  tasksPlanned: number;
  tasksCompleted: number;
  completionRate: number;
  totalMinutesSpent: number;
  topCategory: { name: string; count: number; pct: number } | null;
  productivityScore: number;
  grade: 'A+' | 'A' | 'B' | 'C' | 'Keep going';
  highlights: Task[];
  pendingTasks: Task[];
  digestText: string;
}

const summarize = (tasks: Task[]): Summary => {
  const done = tasks.filter((t) => t.status === 'done').length;
  const minutesSpent = tasks.reduce((acc, t) => acc + (t.timeSpentMinutes ?? 0), 0);
  return {
    total: tasks.length,
    done,
    pct: tasks.length ? Math.round((done / tasks.length) * 100) : 0,
    minutesSpent,
  };
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

  /** Total minutes tracked across all tasks */
  readonly totalMinutesTracked = computed(() => {
    return this.store.tasks().reduce((acc, t) => acc + (t.timeSpentMinutes ?? 0), 0);
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

  /** Auto-generated Weekly Digest Summary */
  readonly weeklyReview = computed<WeeklyReview>(() => {
    const ref = fromISO(this.store.today());
    const start = startOfWeek(ref);
    const end = endOfWeek(ref);
    const weekTasks = this.range(start, end);

    const completed = weekTasks.filter((t) => t.status === 'done');
    const pending = weekTasks.filter((t) => t.status !== 'done');
    const planned = weekTasks.length;
    const completedCount = completed.length;
    const rate = planned ? Math.round((completedCount / planned) * 100) : 0;
    const totalMinutes = weekTasks.reduce((acc, t) => acc + (t.timeSpentMinutes ?? 0), 0);

    // Category breakdown for the week
    const catCounts = new Map<string, number>();
    for (const t of completed) {
      catCounts.set(t.category, (catCounts.get(t.category) ?? 0) + 1);
    }
    let topCategory: { name: string; count: number; pct: number } | null = null;
    if (completed.length > 0) {
      const sortedCats = [...catCounts.entries()].sort((a, b) => b[1] - a[1]);
      if (sortedCats.length) {
        const [name, count] = sortedCats[0];
        topCategory = { name, count, pct: Math.round((count / completed.length) * 100) };
      }
    }

    // Productivity score (weighted between completion rate and consistency)
    const currentStreak = this.streak();
    const streakBonus = Math.min(20, currentStreak * 4);
    const productivityScore = Math.min(100, Math.round(rate * 0.8 + streakBonus));

    let grade: 'A+' | 'A' | 'B' | 'C' | 'Keep going' = 'Keep going';
    if (productivityScore >= 95) grade = 'A+';
    else if (productivityScore >= 80) grade = 'A';
    else if (productivityScore >= 65) grade = 'B';
    else if (productivityScore >= 50) grade = 'C';

    const sDate = `${start.getDate()} ${monthShort(start)}`;
    const eDate = `${end.getDate()} ${monthShort(end)}`;

    const digestLines = [
      `📊 Weekly Review (${sDate} – ${eDate})`,
      `🏆 Score: ${productivityScore}% (Grade: ${grade})`,
      `✅ Completed: ${completedCount}/${planned} tasks (${rate}%)`,
      `⏱ Time Tracked: ${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`,
      `🔥 Active Streak: ${currentStreak} days`,
      topCategory ? `🎯 Top Focus: ${topCategory.name} (${topCategory.pct}% of completed tasks)` : '',
      completed.length ? `\nTop Accomplishments:\n` + completed.slice(0, 5).map((t) => `• ${t.title}`).join('\n') : '',
      pending.length ? `\nCarried Over to Next Week:\n` + pending.slice(0, 3).map((t) => `• ${t.title}`).join('\n') : '',
    ].filter(Boolean);

    return {
      startDate: sDate,
      endDate: eDate,
      tasksPlanned: planned,
      tasksCompleted: completedCount,
      completionRate: rate,
      totalMinutesSpent: totalMinutes,
      topCategory,
      productivityScore,
      grade,
      highlights: completed.slice(0, 5),
      pendingTasks: pending.slice(0, 5),
      digestText: digestLines.join('\n'),
    };
  });
}
