import { Injectable, signal } from '@angular/core';
import { Task } from '../models/task.model';

/** Controls the global create/edit task dialog from any page. */
@Injectable({ providedIn: 'root' })
export class TaskFormService {
  readonly isOpen = signal(false);
  readonly editing = signal<Task | null>(null);
  readonly defaultDate = signal<string | null>(null);

  openNew(date?: string): void {
    this.editing.set(null);
    this.defaultDate.set(date ?? null);
    this.isOpen.set(true);
  }

  openEdit(task: Task): void {
    this.editing.set(task);
    this.defaultDate.set(null);
    this.isOpen.set(true);
  }

  close(): void {
    this.isOpen.set(false);
  }
}
