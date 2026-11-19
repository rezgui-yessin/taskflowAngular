export type Priority = 'low' | 'medium' | 'high';
export type Status = 'todo' | 'doing' | 'done';
export type Repeat = 'none' | 'daily' | 'weekly' | 'monthly';
export type Period = 'today' | 'week' | 'month' | 'all';

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
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
