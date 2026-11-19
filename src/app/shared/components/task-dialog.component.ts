import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CATEGORIES, PRIORITIES, REMINDER_OPTIONS, REPEATS, STATUSES, Priority, Repeat, Status, Subtask } from '../../core/models/task.model';
import { TaskFormService } from '../../core/services/task-form.service';
import { TaskStore } from '../../core/services/task.store';
import { ToastService } from '../../core/services/toast.service';
import { IconComponent } from './icon.component';

@Component({
  selector: 'app-task-dialog',
  standalone: true,
  imports: [FormsModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    .backdrop { position: fixed; inset: 0; z-index: 200; background: rgb(8 10 20 / 55%); backdrop-filter: blur(4px); display: grid; place-items: center; padding: 16px; animation: fade .2s; }
    .dialog { width: min(600px, 100%); max-height: min(92vh, 780px); display: flex; flex-direction: column; background: var(--surface); border: 1px solid var(--border); border-radius: 24px; box-shadow: var(--shadow-lg); animation: pop-in .3s var(--ease); }
    header { display: flex; align-items: center; justify-content: space-between; padding: 20px 24px 8px; }
    .body { padding: 8px 24px 16px; overflow: auto; display: flex; flex-direction: column; gap: 16px; }
    .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    footer { display: flex; gap: 10px; justify-content: flex-end; padding: 16px 24px 20px; border-top: 1px solid var(--border); }
    footer .spacer { flex: 1; }
    .title-in { height: 50px; font-size: 1.05rem; font-weight: 600; }
    .chips { display: flex; gap: 6px; flex-wrap: wrap; }
    .chip { height: 34px; padding: 0 14px; border-radius: var(--radius-pill); border: 1px solid var(--border); background: var(--surface-2); font-weight: 600; font-size: .84rem; cursor: pointer; text-transform: capitalize; transition: all .15s; }
    .chip:hover { border-color: var(--accent-mid); }
    .chip.on { background: var(--accent-soft); border-color: var(--accent); color: var(--accent); }
    .sub { display: flex; align-items: center; gap: 8px; }
    .sub input[type=checkbox] { width: 18px; height: 18px; accent-color: var(--accent); }
    .sub .input { height: 36px; }
    @keyframes fade { from { opacity: 0 } }
    @media (max-width: 560px) { .grid2 { grid-template-columns: 1fr; } .backdrop { align-items: end; padding: 0; } .dialog { border-radius: 24px 24px 0 0; max-height: 94vh; } }
  `],
  template: `
    @if (form.isOpen()) {
      <div class="backdrop" (mousedown)="onBackdrop($event)" (keydown.escape)="form.close()">
        <form class="dialog" role="dialog" aria-modal="true" [attr.aria-label]="form.editing() ? 'Edit task' : 'New task'" (ngSubmit)="save()" #f="ngForm">
          <header>
            <h2>{{ form.editing() ? 'Edit task' : 'New task' }}</h2>
            <button type="button" class="btn btn-icon" (click)="form.close()" aria-label="Close"><app-icon name="x" /></button>
          </header>

          <div class="body">
            <div class="field">
              <input class="input title-in" name="title" [(ngModel)]="title" placeholder="What do you need to do?" required maxlength="140" autofocus [class.invalid]="submitted() && !title.trim()" />
            </div>

            <div class="field">
              <label for="notes">Notes</label>
              <textarea id="notes" class="textarea" name="notes" [(ngModel)]="notes" placeholder="Add details…"></textarea>
            </div>

            <div class="grid2">
              <div class="field"><label for="date">Date</label><input id="date" class="input" type="date" name="date" [(ngModel)]="dueDate" required /></div>
              <div class="field"><label for="time">Time (optional)</label><input id="time" class="input" type="time" name="time" [(ngModel)]="dueTime" /></div>
            </div>

            <div class="field">
              <span class="label">Repeat</span>
              <div class="chips">
                @for (r of repeats; track r.value) {
                  <button type="button" class="chip" [class.on]="repeat() === r.value" (click)="repeat.set(r.value)">{{ r.label }}</button>
                }
              </div>
            </div>

            <div class="field">
              <span class="label">Priority</span>
              <div class="chips">
                @for (p of priorities; track p) {
                  <button type="button" class="chip" [class.on]="priority() === p" (click)="priority.set(p)">{{ p }}</button>
                }
              </div>
            </div>

            <div class="grid2">
              <div class="field">
                <label for="cat">Category</label>
                <select id="cat" class="select" name="cat" [(ngModel)]="category">
                  @for (c of categories; track c) { <option [value]="c">{{ c }}</option> }
                </select>
              </div>
              <div class="field">
                <label for="rem">Reminder</label>
                <select id="rem" class="select" name="rem" [(ngModel)]="reminder">
                  @for (o of reminders; track o.label) { <option [ngValue]="o.value">{{ o.label }}</option> }
                </select>
              </div>
            </div>

            @if (editing()) {
              <div class="field">
                <label for="st">Status</label>
                <select id="st" class="select" name="st" [(ngModel)]="status">
                  @for (s of statuses; track s.value) { <option [value]="s.value">{{ s.label }}</option> }
                </select>
              </div>
            }

            <div class="field">
              <span class="label">Checklist</span>
              @for (s of subtasks(); track s.id) {
                <div class="sub">
                  <input type="checkbox" [checked]="s.done" (change)="toggleSub(s.id)" [attr.aria-label]="'Done: ' + s.title" />
                  <input class="input" [value]="s.title" (input)="renameSub(s.id, $any($event.target).value)" [attr.aria-label]="'Subtask ' + s.title" />
                  <button type="button" class="btn btn-icon" (click)="removeSub(s.id)" aria-label="Remove subtask"><app-icon name="x" [size]="16" /></button>
                </div>
              }
              <div class="sub">
                <input class="input" [(ngModel)]="newSub" name="newSub" placeholder="Add a step and press Enter" (keydown.enter)="$event.preventDefault(); addSub()" />
                <button type="button" class="btn btn-sm" (click)="addSub()">Add</button>
              </div>
            </div>
          </div>

          <footer>
            @if (form.editing()) {
              <button type="button" class="btn btn-danger" (click)="remove()"><app-icon name="trash" [size]="16" />Delete</button>
            }
            <span class="spacer"></span>
            <button type="button" class="btn" (click)="form.close()">Cancel</button>
            <button type="submit" class="btn btn-primary">{{ form.editing() ? 'Save changes' : 'Create task' }}</button>
          </footer>
        </form>
      </div>
    }
  `,
})
export class TaskDialogComponent {
  protected readonly form = inject(TaskFormService);
  private readonly store = inject(TaskStore);
  private readonly toast = inject(ToastService);

  protected readonly categories = CATEGORIES;
  protected readonly priorities = PRIORITIES;
  protected readonly repeats = REPEATS;
  protected readonly reminders = REMINDER_OPTIONS;
  protected readonly statuses = STATUSES;

  protected title = '';
  protected notes = '';
  protected dueDate = '';
  protected dueTime = '';
  protected category = 'Personal';
  protected reminder: number | null = null;
  protected status: Status = 'todo';
  protected newSub = '';

  protected readonly repeat = signal<Repeat>('none');
  protected readonly priority = signal<Priority>('medium');
  protected readonly subtasks = signal<Subtask[]>([]);
  protected readonly submitted = signal(false);
  protected readonly editing = () => this.form.editing() !== null;

  constructor() {
    // Reset the form fields each time the dialog opens.
    effect(() => {
      if (!this.form.isOpen()) return;
      const t = this.form.editing();
      const date = this.form.defaultDate();
      this.submitted.set(false);
      this.newSub = '';
      this.title = t?.title ?? '';
      this.notes = t?.notes ?? '';
      this.dueDate = t?.dueDate ?? date ?? this.store.today();
      this.dueTime = t?.dueTime ?? '';
      this.category = t?.category ?? 'Personal';
      this.reminder = t?.reminderMinutes ?? null;
      this.status = t?.status ?? 'todo';
      this.repeat.set(t?.repeat ?? 'none');
      this.priority.set(t?.priority ?? 'medium');
      this.subtasks.set(t ? t.subtasks.map((s) => ({ ...s })) : []);
    }, { allowSignalWrites: true });
  }

  protected onBackdrop(e: MouseEvent): void {
    if (e.target === e.currentTarget) this.form.close();
  }

  protected addSub(): void {
    const title = this.newSub.trim();
    if (!title) return;
    this.subtasks.update((l) => [...l, { id: crypto.randomUUID(), title, done: false }]);
    this.newSub = '';
  }
  protected toggleSub(id: string): void {
    this.subtasks.update((l) => l.map((s) => (s.id === id ? { ...s, done: !s.done } : s)));
  }
  protected renameSub(id: string, title: string): void {
    this.subtasks.update((l) => l.map((s) => (s.id === id ? { ...s, title } : s)));
  }
  protected removeSub(id: string): void {
    this.subtasks.update((l) => l.filter((s) => s.id !== id));
  }

  protected save(): void {
    this.submitted.set(true);
    if (!this.title.trim() || !this.dueDate) return;

    // A pending text in the checklist input is kept, not lost.
    this.addSub();

    const data = {
      title: this.title.trim(),
      notes: this.notes.trim(),
      dueDate: this.dueDate,
      dueTime: this.dueTime || null,
      category: this.category,
      priority: this.priority(),
      repeat: this.repeat(),
      reminderMinutes: this.reminder,
      subtasks: this.subtasks().filter((s) => s.title.trim()),
    };

    const existing = this.form.editing();
    if (existing) {
      this.store.update(existing.id, data);
      if (this.status !== existing.status) this.store.setStatus(existing.id, this.status);
      this.toast.show('Task updated');
    } else {
      this.store.add(data);
      this.toast.show('Task created');
    }
    this.form.close();
  }

  protected remove(): void {
    const t = this.form.editing();
    if (!t) return;
    const removed = this.store.remove(t.id);
    this.form.close();
    if (removed) {
      this.toast.show(`"${removed.title}" deleted`, { type: 'info', actionLabel: 'Undo', action: () => this.store.restore(removed) });
    }
  }
}
