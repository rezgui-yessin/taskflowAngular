export type Priority = 'low' | 'medium' | 'high';
export type Status = 'todo' | 'doing' | 'done';
export type Repeat = 'none' | 'daily' | 'weekly' | 'monthly';
export type Period = 'today' | 'week' | 'month' | 'all';

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
  /** Optional nested sub-items (one level deep) */
  children?: Subtask[];
}

export interface Tag {
  id: string;
  label: string;
  color: string; // hex color
}

export interface TaskTemplate {
  id: string;
  name: string;
  /** Partial task data stored in the template */
  data: Partial<Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'completedAt' | 'nextSpawned'>>;
  createdAt: string;
}

export interface Habit {
  id: string;
  title: string;
  category: string;
  color: string;
  targetDaysPerWeek: number;
  completedDates: string[]; // ISO YYYY-MM-DD
  createdAt: string;
}

export interface Task {
  id: string;
  title: string;
  notes: string;
  status: Status;
  priority: Priority;
  repeat: Repeat;
  category: string;
  /** ISO date, YYYY-MM-DD */
  dueDate: string;
  /** HH:mm, or null for an all-day task */
  dueTime: string | null;
  /** Minutes before dueTime to remind. null = no reminder */
  reminderMinutes: number | null;
  subtasks: Subtask[];
  /** Tag IDs attached to this task */
  tagIds: string[];
  /** IDs of tasks that must be done before this task can start */
  dependsOn: string[];
  /** Tracked time spent in minutes */
  timeSpentMinutes: number;
  createdAt: string;
  completedAt: string | null;
  /** Set once the next occurrence of a repeating task was created */
  nextSpawned: boolean;
  updatedAt: number;
}

export type NewTask = Partial<Omit<Task, 'id' | 'createdAt' | 'updatedAt'>> & { title: string };

export const CATEGORIES = ['Work', 'Personal', 'Health', 'Learning', 'Finance', 'Home'] as const;

export const PRIORITIES: Priority[] = ['low', 'medium', 'high'];
export const REPEATS: { value: Repeat; label: string }[] = [
  { value: 'none', label: 'Once' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

export const STATUSES: { value: Status; label: string }[] = [
  { value: 'todo', label: 'To do' },
  { value: 'doing', label: 'In progress' },
  { value: 'done', label: 'Done' },
];

export const REMINDER_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: 'No reminder' },
  { value: 0, label: 'At time of task' },
  { value: 5, label: '5 minutes before' },
  { value: 15, label: '15 minutes before' },
  { value: 30, label: '30 minutes before' },
  { value: 60, label: '1 hour before' },
  { value: 1440, label: '1 day before' },
];

/** Preset tag colors */
export const TAG_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f59e0b', '#10b981', '#06b6d4', '#3b82f6',
  '#84cc16', '#f97316',
];
