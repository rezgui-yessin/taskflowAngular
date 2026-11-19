import { Injectable, computed, inject, signal } from '@angular/core';
import { Habit, NewTask, Period, Status, Tag, Task, TaskTemplate } from '../models/task.model';
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
const TAGS_KEY = 'taskflow.tags.v1';
const TEMPLATES_KEY = 'taskflow.templates.v1';
const HABITS_KEY = 'taskflow.habits.v1';

@Injectable({ providedIn: 'root' })
export class TaskStore {
  private readonly realtime = inject(RealtimeService);

  private readonly _tasks = signal<Task[]>(this.load());
  private readonly _today = signal(toISO(new Date()));
  private readonly _tags = signal<Tag[]>(this.loadTags());
  private readonly _templates = signal<TaskTemplate[]>(this.loadTemplates());
  private readonly _habits = signal<Habit[]>(this.loadHabits());

  readonly tasks = this._tasks.asReadonly();
  /** Today's date (YYYY-MM-DD). Rolls over automatically at midnight. */
  readonly today = this._today.asReadonly();
  readonly tags = this._tags.asReadonly();
  readonly templates = this._templates.asReadonly();
  readonly habits = this._habits.asReadonly();

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

  /** Returns true if the task is blocked (at least one dependency is not done). */
  isBlocked(task: Task): boolean {
    if (!task.dependsOn?.length) return false;
    return task.dependsOn.some((depId) => {
      const dep = this.byId(depId);
      return dep && dep.status !== 'done';
    });
  }

  /** Tags for a given task */
  tagsFor(task: Task): Tag[] {
    return (task.tagIds ?? []).map((id) => this._tags().find((t) => t.id === id)).filter(Boolean) as Tag[];
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
      tagIds: input.tagIds ?? [],
      dependsOn: input.dependsOn ?? [],
      timeSpentMinutes: input.timeSpentMinutes ?? 0,
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

  /** Add tracked focus/time to a task */
  logTime(id: string, minutes: number): void {
    const task = this.byId(id);
    if (!task) return;
    const current = task.timeSpentMinutes ?? 0;
    this.update(id, { timeSpentMinutes: Math.max(0, current + minutes) });
  }

  remove(id: string): Task | undefined {
    const removed = this.byId(id);
    this.mutate((list) => list.filter((t) => t.id !== id));
    return removed;
  }

  /** Removes multiple tasks at once */
  removeMany(ids: string[]): number {
    const set = new Set(ids);
    const before = this._tasks().length;
    this.mutate((list) => list.filter((t) => !set.has(t.id)));
    return before - this._tasks().length;
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
        tagIds: [...(task.tagIds ?? [])],
        dependsOn: [],
      });
    }
  }

  /** Set status for multiple tasks */
  setStatusMany(ids: string[], status: Status): void {
    ids.forEach((id) => this.setStatus(id, status));
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

  // ---------- tags ----------

  addTag(label: string, color: string): Tag {
    const tag: Tag = { id: crypto.randomUUID(), label: label.trim(), color };
    this._tags.update((list) => [...list, tag]);
    this.saveTags();
    return tag;
  }

  updateTag(id: string, patch: Partial<Tag>): void {
    this._tags.update((list) => list.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    this.saveTags();
  }

  removeTag(id: string): void {
    this._tags.update((list) => list.filter((t) => t.id !== id));
    // Remove tag from all tasks
    this.mutate((list) =>
      list.map((t) => ({ ...t, tagIds: (t.tagIds ?? []).filter((tid) => tid !== id) }))
    );
    this.saveTags();
  }

  // ---------- templates ----------

  saveTemplate(name: string, task: Task): TaskTemplate {
    const template: TaskTemplate = {
      id: crypto.randomUUID(),
      name: name.trim(),
      data: {
        title: task.title,
        notes: task.notes,
        priority: task.priority,
        repeat: task.repeat,
        category: task.category,
        dueTime: task.dueTime,
        reminderMinutes: task.reminderMinutes,
        subtasks: task.subtasks.map((s) => ({ ...s, id: crypto.randomUUID(), done: false })),
        tagIds: [...(task.tagIds ?? [])],
        dependsOn: [],
      },
      createdAt: new Date().toISOString(),
    };
    this._templates.update((list) => [template, ...list]);
    this.saveTemplates();
    return template;
  }

  removeTemplate(id: string): void {
    this._templates.update((list) => list.filter((t) => t.id !== id));
    this.saveTemplates();
  }

  applyTemplate(template: TaskTemplate, dueDate?: string): NewTask {
    return {
      ...template.data,
      title: template.data.title ?? 'Task from template',
      dueDate: dueDate ?? this._today(),
      subtasks: (template.data.subtasks ?? []).map((s) => ({ ...s, id: crypto.randomUUID(), done: false })),
    };
  }

  // ---------- write path ----------

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

  private saveTags(): void {
    try { localStorage.setItem(TAGS_KEY, JSON.stringify(this._tags())); } catch { /* ignore */ }
  }

  private saveTemplates(): void {
    try { localStorage.setItem(TEMPLATES_KEY, JSON.stringify(this._templates())); } catch { /* ignore */ }
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
      tagIds: [],
      dependsOn: [],
      timeSpentMinutes: 0,
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
      if (!raw) return [];
      const tasks = JSON.parse(raw) as Task[];
      // Migrate old tasks missing new fields
      return tasks.map((t) => ({
        ...t,
        tagIds: t.tagIds ?? [],
        dependsOn: t.dependsOn ?? [],
        timeSpentMinutes: t.timeSpentMinutes ?? (t.status === 'done' ? 30 : 0),
      }));
    } catch {
      return [];
    }
  }

  private loadTags(): Tag[] {
    try {
      const raw = localStorage.getItem(TAGS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }

  private loadTemplates(): TaskTemplate[] {
    try {
      const raw = localStorage.getItem(TEMPLATES_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }

  // ---------- habits ----------

  addHabit(title: string, category: string, color: string, targetDaysPerWeek = 7): Habit {
    const habit: Habit = {
      id: crypto.randomUUID(),
      title: title.trim(),
      category: category || 'Personal',
      color: color || '#6366f1',
      targetDaysPerWeek,
      completedDates: [],
      createdAt: new Date().toISOString(),
    };
    this._habits.update((list) => [...list, habit]);
    this.saveHabits();
    return habit;
  }

  removeHabit(id: string): void {
    this._habits.update((list) => list.filter((h) => h.id !== id));
    this.saveHabits();
  }

  toggleHabitDay(id: string, isoDate: string): void {
    this._habits.update((list) =>
      list.map((h) => {
        if (h.id !== id) return h;
        const exists = h.completedDates.includes(isoDate);
        const completedDates = exists
          ? h.completedDates.filter((d) => d !== isoDate)
          : [...h.completedDates, isoDate];
        return { ...h, completedDates };
      })
    );
    this.saveHabits();
  }

  habitStreak(habit: Habit): number {
    const set = new Set(habit.completedDates);
    let cursor = fromISO(this._today());
    const todayStr = toISO(cursor);
    if (!set.has(todayStr)) {
      cursor = addDays(cursor, -1);
    }
    let streak = 0;
    while (set.has(toISO(cursor))) {
      streak++;
      cursor = addDays(cursor, -1);
    }
    return streak;
  }

  private saveHabits(): void {
    try { localStorage.setItem(HABITS_KEY, JSON.stringify(this._habits())); } catch { /* ignore */ }
  }

  private loadHabits(): Habit[] {
    try {
      const raw = localStorage.getItem(HABITS_KEY);
      if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    return this.seedHabits();
  }

  private seedHabits(): Habit[] {
    const today = new Date();
    const d = (n: number) => toISO(addDays(today, n));
    const sample: Habit[] = [
      {
        id: crypto.randomUUID(),
        title: 'Drink 2L Water',
        category: 'Health',
        color: '#06b6d4',
        targetDaysPerWeek: 7,
        completedDates: [d(0), d(-1), d(-2), d(-3)],
        createdAt: new Date().toISOString(),
      },
      {
        id: crypto.randomUUID(),
        title: 'Read 20 minutes',
        category: 'Learning',
        color: '#8b5cf6',
        targetDaysPerWeek: 5,
        completedDates: [d(0), d(-1), d(-2)],
        createdAt: new Date().toISOString(),
      },
      {
        id: crypto.randomUUID(),
        title: 'Morning Workout / Stretch',
        category: 'Health',
        color: '#10b981',
        targetDaysPerWeek: 6,
        completedDates: [d(0), d(-1), d(-3)],
        createdAt: new Date().toISOString(),
      },
      {
        id: crypto.randomUUID(),
        title: 'Daily Meditation',
        category: 'Personal',
        color: '#f59e0b',
        targetDaysPerWeek: 7,
        completedDates: [d(-1), d(-2), d(-3), d(-4)],
        createdAt: new Date().toISOString(),
      },
    ];
    try { localStorage.setItem(HABITS_KEY, JSON.stringify(sample)); } catch {}
    return sample;
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
