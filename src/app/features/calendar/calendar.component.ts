import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { IconComponent } from '../../shared/components/icon.component';
import { TaskItemComponent } from '../../shared/components/task-item.component';
import { Task } from '../../core/models/task.model';
import { TaskStore } from '../../core/services/task.store';
import { TaskFormService } from '../../core/services/task-form.service';
import { addDays, addMonths, formatMonthYear, fromISO, monthGrid, startOfWeek, toISO } from '../../core/utils/date.utils';

type Mode = 'month' | 'week';
interface Cell { iso: string; date: Date; inMonth: boolean; isToday: boolean; tasks: Task[]; }

@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [DatePipe, IconComponent, TaskItemComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './calendar.component.scss',
  template: `
    <section class="page">
      <div class="page-head">
        <div>
          <div class="eyebrow">Schedule</div>
          <h1>{{ title() }}</h1>
        </div>
        <div class="controls">
          <div class="seg">
            <button class="seg-btn" [class.active]="mode() === 'month'" (click)="mode.set('month')">Month</button>
            <button class="seg-btn" [class.active]="mode() === 'week'" (click)="mode.set('week')">Week</button>
          </div>
          <div class="nav">
            <button class="btn btn-icon" (click)="step(-1)" aria-label="Previous"><app-icon name="chevL" /></button>
            <button class="btn btn-sm" (click)="goToday()">Today</button>
            <button class="btn btn-icon" (click)="step(1)" aria-label="Next"><app-icon name="chevR" /></button>
          </div>
        </div>
      </div>

      <div class="layout">
        <div class="card cal">
          <div class="weekdays">
            @for (w of weekdays; track w) { <div>{{ w }}</div> }
          </div>
          <div class="grid" [class.week]="mode() === 'week'">
            @for (c of cells(); track c.iso) {
              <div class="cell" [class.out]="!c.inMonth && mode() === 'month'" [class.today]="c.isToday" [class.sel]="c.iso === selected()"
                role="button" tabindex="0" (click)="selected.set(c.iso)" (keydown.enter)="selected.set(c.iso)" (dblclick)="form.openNew(c.iso)"
                [attr.aria-label]="(c.date | date: 'fullDate') + ', ' + c.tasks.length + ' tasks'">
                <div class="num"><span>{{ c.date.getDate() }}</span></div>
                <div class="chips">
                  @for (t of c.tasks.slice(0, mode() === 'week' ? 8 : 3); track t.id) {
                    <div class="chip" [attr.data-p]="t.priority" [class.done]="t.status === 'done'">{{ t.title }}</div>
                  }
                  @if (c.tasks.length > (mode() === 'week' ? 8 : 3)) { <div class="more">+{{ c.tasks.length - (mode() === 'week' ? 8 : 3) }} more</div> }
                </div>
                @if (c.tasks.length) { <div class="dots"><i [attr.data-n]="c.tasks.length">{{ c.tasks.length }}</i></div> }
              </div>
            }
          </div>
        </div>

        <aside class="card agenda">
          <div class="card-head">
            <div>
              <div class="eyebrow">Selected day</div>
              <h2>{{ selectedDate() | date: 'EEEE, d MMMM' }}</h2>
            </div>
            <button class="btn btn-sm btn-primary" (click)="form.openNew(selected())"><app-icon name="plus" [size]="16" [stroke]="2.5" />Add</button>
          </div>
          <div class="list">
            @for (t of dayTasks(); track t.id) { <app-task-item [task]="t" /> }
            @empty {
              <div class="empty">
                <div class="empty-ic"><app-icon name="calendar" /></div>
                <strong>Free day</strong>
                <span>No tasks on this date.</span>
              </div>
            }
          </div>
          <p class="hint faint">Tip: double-click a day to add a task.</p>
        </aside>
      </div>
    </section>
  `,
})
export class CalendarComponent {
  protected readonly store = inject(TaskStore);
  protected readonly form = inject(TaskFormService);

  protected readonly mode = signal<Mode>('month');
  protected readonly cursor = signal(fromISO(this.store.today()));
  protected readonly selected = signal(this.store.today());
  protected readonly weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  protected readonly selectedDate = computed(() => fromISO(this.selected()));
  protected readonly dayTasks = computed(() => this.store.tasks() && this.store.forDate(this.selected()));

  protected readonly title = computed(() => {
    const c = this.cursor();
    if (this.mode() === 'month') return formatMonthYear(c);
    const s = startOfWeek(c);
    const f = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
    return `${f.format(s)} – ${f.format(addDays(s, 6))}`;
  });

  protected readonly cells = computed<Cell[]>(() => {
    const c = this.cursor();
    const today = this.store.today();
    const days = this.mode() === 'month' ? monthGrid(c) : Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(c), i));
    const byDate = new Map<string, Task[]>();
    for (const t of this.store.tasks()) byDate.set(t.dueDate, [...(byDate.get(t.dueDate) ?? []), t]);

    return days.map((date) => {
      const iso = toISO(date);
      const tasks = (byDate.get(iso) ?? []).sort(
        (a, b) => (a.dueTime ?? '99').localeCompare(b.dueTime ?? '99') || a.title.localeCompare(b.title),
      );
      return { iso, date, tasks, inMonth: date.getMonth() === c.getMonth(), isToday: iso === today };
    });
  });

  protected step(dir: 1 | -1): void {
    this.cursor.update((c) => (this.mode() === 'month' ? addMonths(c, dir) : addDays(c, dir * 7)));
  }

  protected goToday(): void {
    this.cursor.set(fromISO(this.store.today()));
    this.selected.set(this.store.today());
  }
}
