import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { Task } from '../../core/models/task.model';
import { TaskStore } from '../../core/services/task.store';
import { TaskFormService } from '../../core/services/task-form.service';
import { ToastService } from '../../core/services/toast.service';
import { PomodoroService } from '../../core/services/pomodoro.service';
import { relativeDay } from '../../core/utils/date.utils';
import { IconComponent } from './icon.component';

@Component({
  selector: 'app-task-item',
  standalone: true,
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    :host { display: block; }
    .row { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: var(--radius); background: var(--surface); border: 1px solid var(--border); transition: border-color .15s, box-shadow .15s, transform .15s; }
    .row:hover { border-color: var(--accent-mid); box-shadow: var(--shadow); }
    .row.blocked { border-color: color-mix(in srgb, var(--warning) 50%, var(--border)); background: color-mix(in srgb, var(--warning) 4%, var(--surface)); }
    .row.selected { border-color: var(--accent); background: var(--accent-soft); }
    /* Checkbox for bulk selection */
    .sel-cb { flex: none; width: 18px; height: 18px; accent-color: var(--accent); cursor: pointer; }
    /* Done check */
    .check { flex: none; width: 24px; height: 24px; border-radius: 8px; border: 2px solid var(--text-3); background: transparent; display: grid; place-items: center; cursor: pointer; color: #fff; transition: all .2s var(--ease); padding: 0; }
    .check:hover { border-color: var(--accent); }
    .check.done { background: var(--success); border-color: var(--success); }
    .check.blocked-chk { border-color: var(--warning); cursor: not-allowed; opacity: .7; }
    .check app-icon { transform: scale(0); transition: transform .2s var(--ease); }
    .check.done app-icon { transform: scale(1); }
    .main { flex: 1; min-width: 0; cursor: pointer; }
    .title { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .done-t { text-decoration: line-through; color: var(--text-3); }
    .meta { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; margin-top: 4px; font-size: 0.78rem; color: var(--text-3); }
    .meta span { display: inline-flex; align-items: center; gap: 4px; }
    .late { color: var(--danger); font-weight: 650; }
    .bar { height: 4px; width: 56px; border-radius: 4px; background: var(--surface-3); overflow: hidden; }
    .bar i { display: block; height: 100%; background: var(--accent); border-radius: 4px; }
    .actions { display: flex; gap: 2px; opacity: 0; transition: opacity .15s; }
    .row:hover .actions, .row:focus-within .actions { opacity: 1; }
    @media (hover: none) { .actions { opacity: 1; } }
    .dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
    .dot[data-p='high'] { background: var(--danger); } .dot[data-p='medium'] { background: var(--warning); } .dot[data-p='low'] { background: var(--success); }
    /* Tags inline */
    .tag-pill { display: inline-flex; align-items: center; height: 18px; padding: 0 7px; border-radius: var(--radius-pill); font-size: .68rem; font-weight: 650; }
    /* Blocked badge */
    .blocked-badge { display: inline-flex; align-items: center; gap: 3px; height: 18px; padding: 0 7px; border-radius: var(--radius-pill); font-size: .68rem; font-weight: 700; background: color-mix(in srgb, var(--warning) 16%, transparent); color: color-mix(in srgb, var(--warning) 80%, black); }
  `],
  template: `
    @let t = task();
    @let blocked = isBlocked();
    <div class="row" [class.blocked]="blocked" [class.selected]="selected()">
      <!-- Bulk select checkbox (shown when selectionMode is active) -->
      @if (selectionMode()) {
        <input type="checkbox" class="sel-cb" [checked]="selected()" (change)="selectionToggle.emit(t.id)" [attr.aria-label]="'Select ' + t.title" />
      }

      <!-- Done toggle (disabled if blocked) -->
      <button class="check" [class.done]="t.status === 'done'" [class.blocked-chk]="blocked && t.status !== 'done'"
        (click)="onCheckClick()"
        [attr.aria-label]="blocked ? 'Task is blocked by dependencies' : (t.status === 'done' ? 'Mark as not done' : 'Mark as done')">
        @if (blocked && t.status !== 'done') {
          <app-icon name="lock" [size]="12" />
        } @else {
          <app-icon name="check" [size]="14" [stroke]="3.5" />
        }
      </button>

      <div class="main" (click)="form.openEdit(t)" (keydown.enter)="form.openEdit(t)" tabindex="0">
        <div class="title" [class.done-t]="t.status === 'done'">{{ t.title }}</div>
        <div class="meta">
          <span class="dot" [attr.data-p]="t.priority" [title]="t.priority + ' priority'"></span>
          <span [class.late]="isLate()">
            <app-icon name="calendar" [size]="12" />{{ day() }}@if (t.dueTime) {, {{ t.dueTime }}}
          </span>
          @if (t.repeat !== 'none') { <span><app-icon name="repeat" [size]="12" />{{ t.repeat }}</span> }
          @if (t.reminderMinutes !== null) { <span><app-icon name="bell" [size]="12" /></span> }
          <span>{{ t.category }}</span>
          @if (t.subtasks.length) {
            <span><span class="bar"><i [style.width.%]="subPct()"></i></span>{{ doneSubs() }}/{{ t.subtasks.length }}</span>
          }
          <!-- Tracked Time -->
          @if (t.timeSpentMinutes) {
            <span title="Tracked time spent"><app-icon name="clock" [size]="12" />{{ formatMins(t.timeSpentMinutes) }}</span>
          }
          <!-- Tags -->
          @for (tag of taskTags(); track tag.id) {
            <span class="tag-pill" [style.background]="tag.color + '22'" [style.color]="tag.color">{{ tag.label }}</span>
          }
          <!-- Blocked indicator -->
          @if (blocked) {
            <span class="blocked-badge"><app-icon name="lock" [size]="10" />blocked</span>
          }
        </div>
      </div>
      <div class="actions">
        <button class="btn btn-icon" (click)="$event.stopPropagation(); pomodoro.startTaskSession(t.id)" title="Start Pomodoro focus session"><app-icon name="timer" [size]="16" /></button>
        <button class="btn btn-icon" (click)="form.openEdit(t)" aria-label="Edit task"><app-icon name="edit" [size]="16" /></button>
        <button class="btn btn-icon" (click)="remove()" aria-label="Delete task"><app-icon name="trash" [size]="16" /></button>
      </div>
    </div>
  `,
})
export class TaskItemComponent {
  readonly task = input.required<Task>();
  readonly selectionMode = input<boolean>(false);
  readonly selected = input<boolean>(false);
  readonly selectionToggle = output<string>();

  protected readonly store = inject(TaskStore);
  protected readonly form = inject(TaskFormService);
  protected readonly pomodoro = inject(PomodoroService);
  private readonly toast = inject(ToastService);

  protected formatMins(mins: number): string {
    if (mins >= 60) {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return m ? `${h}h ${m}m` : `${h}h`;
    }
    return `${mins}m`;
  }

  protected readonly day = computed(() => relativeDay(this.task().dueDate, this.store.today()));
  protected readonly isLate = computed(() => this.task().status !== 'done' && this.task().dueDate < this.store.today());
  protected readonly doneSubs = computed(() => this.task().subtasks.filter((s) => s.done).length);
  protected readonly subPct = computed(() => (this.doneSubs() / Math.max(1, this.task().subtasks.length)) * 100);
  protected readonly isBlocked = computed(() => this.store.isBlocked(this.task()));
  protected readonly taskTags = computed(() => this.store.tagsFor(this.task()));

  protected onCheckClick(): void {
    if (this.isBlocked() && this.task().status !== 'done') {
      this.toast.show('This task is blocked by unfinished dependencies', { type: 'info' });
      return;
    }
    this.store.toggleDone(this.task().id);
  }

  protected remove(): void {
    const removed = this.store.remove(this.task().id);
    if (removed) {
      this.toast.show(`"${removed.title}" deleted`, {
        type: 'info',
        actionLabel: 'Undo',
        action: () => this.store.restore(removed),
      });
    }
  }
}
