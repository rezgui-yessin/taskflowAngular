import { Injectable, computed, inject, signal } from '@angular/core';
import { NewTask, Period, Status, Task } from '../models/task.model';
import { RealtimeService } from './realtime.service';
import {
  addDays,
  endOfMonth,
  endOfWeek,
  fromISO,
  nextOccurrence,
  startOfMonth,
  startOfWeek,
  toISO,
} from '../utils/date.utils';

const KEY = 'taskflow.tasks.v1';

@Injectable({ providedIn: 'root' })
export class TaskStore {
  private readonly realtime = inject(RealtimeService);

  private readonly _tasks = signal<Task[]>(this.load());
  private readonly _today = signal(toISO(new Date()));

  readonly tasks = this._tasks.asReadonly();
  /** Today's date (YYYY-MM-DD). Rolls over automatically at midnight. */
  readonly today = this._today.asReadonly();

  readonly open = computed(() => this._tasks().filter((t) => t.status !== 'done'));
  readonly overdue = computed(() =>
    this.open()
      .filter((t) => t.dueDate < this._today())
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
  );
  readonly todayTasks = computed(() => this.forRange(this._today(), this._today()));

  constructor() {
    if (this._tasks().length === 0 && !localStorage.getItem('taskflow.seeded')) {
      localStorage.setItem('taskflow.seeded', '1');
      this.mutate(() => this.seed());
    }

    // Changes made in another tab/window (or later: pushed by the server) replace our copy.
    // The sender already saved them, so we only update the signal: no echo, no loops.
    this.realtime.on<Task[]>('tasks', (tasks) => this._tasks.set(tasks));
    // Fallback for browsers without BroadcastChannel.
    addEventListener('storage', (e) => {
      if (e.key === KEY) this._tasks.set(this.load());
    });

    // Roll "today" over at midnight and when the tab becomes visible again.
    const refreshToday = () => this._today.set(toISO(new Date()));
    setInterval(refreshToday, 30_000);
    document.addEventListener('visibilitychange', refreshToday);
  }

  // ---------- queries ----------

  byId(id: string): Task | undefined {
    return this._tasks().find((t) => t.id === id);
  }

  forRange(fromIso: string, toIso: string): Task[] {
    return this._tasks()
      .filter((t) => t.dueDate >= fromIso && t.dueDate <= toIso)
      .sort(compareTasks);
  }

  forDate(iso: string): Task[] {
    return this.forRange(iso, iso);
  }

  forPeriod(period: Period, ref: Date = new Date()): Task[] {
    switch (period) {
      case 'today':
        return this.forRange(toISO(ref), toISO(ref));
      case 'week':
        return this.forRange(toISO(startOfWeek(ref)), toISO(endOfWeek(ref)));
      case 'month':
        return this.forRange(toISO(startOfMonth(ref)), toISO(endOfMonth(ref)));
      default:
        return [...this._tasks()].sort(compareTasks);
    }
  }

  // ---------- commands ----------

  add(input: NewTask): Task {
    const now = new Date();
    const task: Task = {
      id: crypto.randomUUID(),
      title: input.title.trim(),
      notes: input.notes ?? '',
      status: input.status ?? 'todo',
      priority: input.priority ?? 'medium',
      repeat: input.repeat ?? 'none',
      category: input.category ?? 'Personal',
      dueDate: input.dueDate ?? this._today(),
      dueTime: input.dueTime ?? null,
      reminderMinutes: input.reminderMinutes ?? null,
      subtasks: input.subtasks ?? [],
      createdAt: now.toISOString(),
      completedAt: input.status === 'done' ? now.toISOString() : null,
      nextSpawned: false,
      updatedAt: Date.now(),
    };
    this.mutate((list) => [task, ...list]);
    return task;
  }

  update(id: string, patch: Partial<Task>): void {
    this.mutate((list) => list.map((t) => (t.id === id ? { ...t, ...patch, updatedAt: Date.now() } : t)));
  }

  remove(id: string): Task | undefined {
    const removed = this.byId(id);
    this.mutate((list) => list.filter((t) => t.id !== id));
    return removed;
  }

  /** Brings back a task removed by mistake (used by the "Undo" toast). */
  restore(task: Task): void {
    this.mutate((list) => [task, ...list.filter((t) => t.id !== task.id)]);
  }

  setStatus(id: string, status: Status): void {
    const task = this.byId(id);
    if (!task || task.status === status) return;

    const patch: Partial<Task> = {
      status,
      completedAt: status === 'done' ? new Date().toISOString() : null,
    };
    // Finishing a task completes its checklist as well.
    if (status === 'done') patch.subtasks = task.subtasks.map((s) => ({ ...s, done: true }));
    this.update(id, patch);

    // A repeating task creates its next occurrence the first time it's completed.
    if (status === 'done' && task.repeat !== 'none' && !task.nextSpawned) {
      this.update(id, { nextSpawned: true });
      this.add({
        title: task.title,
        notes: task.notes,
        priority: task.priority,
        repeat: task.repeat,
        category: task.category,
        dueDate: nextOccurrence(task.dueDate, task.repeat),
        dueTime: task.dueTime,
        reminderMinutes: task.reminderMinutes,
        subtasks: task.subtasks.map((s) => ({ ...s, id: crypto.randomUUID(), done: false })),
      });
    }
  }

  toggleDone(id: string): void {
    const task = this.byId(id);
    if (task) this.setStatus(id, task.status === 'done' ? 'todo' : 'done');
  }

  toggleSubtask(taskId: string, subtaskId: string): void {
    const task = this.byId(taskId);
    if (!task) return;
    const subtasks = task.subtasks.map((s) => (s.id === subtaskId ? { ...s, done: !s.done } : s));
    this.update(taskId, { subtasks });

    // Progress-aware status: first tick starts the task, last tick finishes it.
    const doneCount = subtasks.filter((s) => s.done).length;
    if (subtasks.length && doneCount === subtasks.length) this.setStatus(taskId, 'done');
    else if (doneCount > 0 && task.status === 'todo') this.update(taskId, { status: 'doing' });
    else if (task.status === 'done') this.update(taskId, { status: 'doing', completedAt: null });
  }

  /** Removes every task (used to wipe the demo data). */
  clearAll(): void {
    this.mutate(() => []);
  }

  clearCompleted(): number {
    const count = this._tasks().filter((t) => t.status === 'done').length;
    this.mutate((list) => list.filter((t) => t.status !== 'done'));
    return count;
  }

  /** Single write path: update the signal, save immediately, tell other tabs/devices. */
  private mutate(fn: (list: Task[]) => Task[]): void {
    const next = fn(this._tasks());
    this._tasks.set(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* storage full or unavailable: keep working in memory */
    }
    this.realtime.emit('tasks', next);
  }

  // ---------- demo data ----------

  private seed(): Task[] {
    const today = new Date();
    const d = (n: number) => toISO(addDays(today, n));
    const mk = (
      title: string,
      dayOffset: number,
      extra: Partial<Task> = {},
    ): Task => ({
      id: crypto.randomUUID(),
      title,
      notes: '',
      status: 'todo',
      priority: 'medium',
      repeat: 'none',
      category: 'Personal',
      dueDate: d(dayOffset),
      dueTime: null,
      reminderMinutes: null,
      subtasks: [],
      createdAt: new Date().toISOString(),
      completedAt: null,
      nextSpawned: false,
      updatedAt: Date.now(),
      ...extra,
    });
    const sub = (title: string, done = false) => ({ id: crypto.randomUUID(), title, done });
    const doneAt = (offset: number) => addDays(today, offset).toISOString();

    return [
      mk('Plan the week and set top 3 priorities', 0, {
        category: 'Work', priority: 'high', repeat: 'weekly', dueTime: '09:00', reminderMinutes: 15,
        subtasks: [sub('Review last week', true), sub('Pick top 3 goals'), sub('Block time in calendar')],
        status: 'doing',
      }),
      mk('Morning workout', 0, { category: 'Health', repeat: 'daily', dueTime: '07:30', reminderMinutes: 30, status: 'done', completedAt: doneAt(0) }),
      mk('Read 20 pages', 0, { category: 'Learning', repeat: 'daily', dueTime: '21:00', reminderMinutes: 0, priority: 'low' }),
      mk('Reply to important emails', 0, { category: 'Work', priority: 'high', dueTime: '14:00', reminderMinutes: 15 }),
      mk('Pay electricity bill', 1, { category: 'Finance', priority: 'high', reminderMinutes: 1440 }),
      mk('Grocery shopping', 2, { category: 'Home', dueTime: '18:00', reminderMinutes: 60 }),
      mk('Team sync', 3, { category: 'Work', dueTime: '10:30', reminderMinutes: 15, notes: 'Prepare a short status update.' }),
      mk('Monthly budget review', 6, { category: 'Finance', repeat: 'monthly', priority: 'high' }),
      mk('Book dentist appointment', -1, { category: 'Health', priority: 'medium' }),
      mk('Finish online course module', -1, { category: 'Learning', status: 'done', completedAt: doneAt(-1) }),
      mk('Morning workout', -1, { category: 'Health', repeat: 'daily', status: 'done', completedAt: doneAt(-1) }),
      mk('Morning workout', -2, { category: 'Health', repeat: 'daily', status: 'done', completedAt: doneAt(-2) }),
      mk('Clean the apartment', -2, { category: 'Home', status: 'done', completedAt: doneAt(-2) }),
      mk('Weekly review', -3, { category: 'Work', repeat: 'weekly', status: 'done', completedAt: doneAt(-3) }),
      mk('Call parents', -4, { category: 'Personal', status: 'done', completedAt: doneAt(-4) }),
      mk('Submit expense report', -5, { category: 'Work', status: 'done', completedAt: doneAt(-5) }),
    ];
  }

  private load(): Task[] {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as Task[]) : [];
    } catch {
      return [];
    }
  }
}

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 } as const;

/** Open tasks first, then by date, time, priority. */
export function compareTasks(a: Task, b: Task): number {
  if ((a.status === 'done') !== (b.status === 'done')) return a.status === 'done' ? 1 : -1;
  return (
    a.dueDate.localeCompare(b.dueDate) ||
    (a.dueTime ?? '99:99').localeCompare(b.dueTime ?? '99:99') ||
    PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
  );
}

export { fromISO };
