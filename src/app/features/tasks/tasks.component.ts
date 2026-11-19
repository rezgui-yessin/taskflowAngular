import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IconComponent } from '../../shared/components/icon.component';
import { TaskItemComponent } from '../../shared/components/task-item.component';
import { Period, Priority, STATUSES, Status, Task } from '../../core/models/task.model';
import { TaskStore } from '../../core/services/task.store';
import { TaskFormService } from '../../core/services/task-form.service';
import { ToastService } from '../../core/services/toast.service';
import { fromISO, relativeDay, toISO, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from '../../core/utils/date.utils';

type View = 'list' | 'board';

@Component({
  selector: 'app-tasks',
  standalone: true,
  imports: [FormsModule, IconComponent, TaskItemComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './tasks.component.scss',
  template: `
    <section class="page">
      <div class="page-head">
        <div>
          <div class="eyebrow">Plan & track</div>
          <h1>Tasks</h1>
          <p class="sub">{{ rangeLabel() }}</p>
        </div>
        <button class="btn btn-primary" (click)="form.openNew()"><app-icon name="plus" [size]="18" [stroke]="2.5" /> New task</button>
      </div>

      <div class="toolbar">
        <div class="seg" role="tablist" aria-label="Period">
          @for (p of periods; track p.value) {
            <button class="seg-btn" role="tab" [class.active]="period() === p.value" [attr.aria-selected]="period() === p.value" (click)="period.set(p.value)">
              {{ p.label }} <span class="count">{{ counts()[p.value] }}</span>
            </button>
          }
        </div>

        <div class="filters">
          <input class="input input-sm search" type="search" placeholder="Search tasks…" [ngModel]="query()" (ngModelChange)="query.set($event)" aria-label="Search tasks" />
          <select class="select select-sm" [ngModel]="priority()" (ngModelChange)="priority.set($event)" aria-label="Filter by priority">
            <option value="all">All priorities</option>
            <option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
          </select>
          <!-- Tag filter -->
          @if (store.tags().length) {
            <select class="select select-sm" [ngModel]="tagFilter()" (ngModelChange)="tagFilter.set($event)" aria-label="Filter by tag">
              <option value="">All tags</option>
              @for (tag of store.tags(); track tag.id) {
                <option [value]="tag.id">{{ tag.label }}</option>
              }
            </select>
          }
          <div class="seg">
            <button class="seg-btn" [class.active]="view() === 'list'" (click)="view.set('list')" aria-label="List view"><app-icon name="list" [size]="16" />List</button>
            <button class="seg-btn" [class.active]="view() === 'board'" (click)="view.set('board')" aria-label="Board view"><app-icon name="board" [size]="16" />Board</button>
          </div>
        </div>
      </div>

      <!-- Bulk action bar -->
      @if (selectionMode()) {
        <div class="bulk-bar">
          <label class="bulk-check">
            <input type="checkbox" [checked]="allSelected()" (change)="toggleSelectAll()" />
            <span>{{ selectedIds().size }} selected</span>
          </label>
          <span class="spacer"></span>
          <button class="btn btn-sm" (click)="bulkComplete()" [disabled]="!selectedIds().size"><app-icon name="check" [size]="14" />Mark done</button>
          <button class="btn btn-sm" (click)="bulkUncomplete()" [disabled]="!selectedIds().size"><app-icon name="x" [size]="14" />Mark todo</button>
          <button class="btn btn-sm btn-danger" (click)="bulkDelete()" [disabled]="!selectedIds().size"><app-icon name="trash" [size]="14" />Delete</button>
          <button class="btn btn-sm btn-ghost" (click)="exitSelection()">Cancel</button>
        </div>
      } @else {
        <div class="bulk-hint">
          <button class="btn btn-sm btn-ghost" (click)="enterSelection()"><app-icon name="check-square" [size]="15" />Select tasks</button>
        </div>
      }

      @if (view() === 'list') {
        @for (g of groups(); track g.date) {
          <div class="group">
            <h3 class="group-title" [class.late]="g.late">{{ g.label }} <span class="faint">{{ g.tasks.length }}</span></h3>
            <div class="list">
              @for (t of g.tasks; track t.id) {
                <app-task-item
                  [task]="t"
                  [selectionMode]="selectionMode()"
                  [selected]="selectedIds().has(t.id)"
                  (selectionToggle)="toggleSelect($event)"
                />
              }
            </div>
          </div>
        } @empty {
          <div class="card empty">
            <div class="empty-ic"><app-icon name="sparkle" /></div>
            <strong>{{ query() || priority() !== 'all' || tagFilter() ? 'No tasks match your filters' : 'No tasks in this period' }}</strong>
            <span>Create a task to get started.</span>
            <button class="btn btn-primary btn-sm" (click)="form.openNew()">Add a task</button>
          </div>
        }
        @if (doneCount() > 0 && period() === 'all') {
          <div><button class="btn btn-sm btn-ghost" (click)="clearDone()">Clear {{ doneCount() }} completed</button></div>
        }
      } @else {
        <div class="board">
          @for (col of columns; track col.value) {
            <div class="col" [class.over]="dragOver() === col.value"
              (dragover)="$event.preventDefault(); dragOver.set(col.value)" (dragleave)="dragOver.set(null)" (drop)="drop($event, col.value)">
              <div class="col-head"><strong>{{ col.label }}</strong><span class="count">{{ board()[col.value].length }}</span></div>
              <div class="col-body">
                @for (t of board()[col.value]; track t.id) {
                  <article class="kcard" [class.kblocked]="store.isBlocked(t)" draggable="true" (dragstart)="drag($event, t)" (dragend)="dragOver.set(null)" (click)="form.openEdit(t)" tabindex="0" (keydown.enter)="form.openEdit(t)">
                    <div class="kt">{{ t.title }}</div>
                    <div class="km">
                      <span class="badge" [attr.data-p]="t.priority">{{ t.priority }}</span>
                      <span class="faint">{{ day(t.dueDate) }}{{ t.dueTime ? ', ' + t.dueTime : '' }}</span>
                    </div>
                    <!-- Tags on board card -->
                    @if (store.tagsFor(t).length) {
                      <div class="ktags">
                        @for (tag of store.tagsFor(t); track tag.id) {
                          <span class="ktag" [style.background]="tag.color + '22'" [style.color]="tag.color">{{ tag.label }}</span>
                        }
                      </div>
                    }
                    @if (store.isBlocked(t)) {
                      <div class="kblocked-label">🔒 blocked</div>
                    }
                  </article>
                } @empty { <div class="drop-hint">Drop tasks here</div> }
              </div>
            </div>
          }
        </div>
      }
    </section>
  `,
})
export class TasksComponent {
  protected readonly store = inject(TaskStore);
  protected readonly form = inject(TaskFormService);
  private readonly toast = inject(ToastService);

  protected readonly periods: { value: Period; label: string }[] = [
    { value: 'today', label: 'Today' },
    { value: 'week', label: 'This week' },
    { value: 'month', label: 'This month' },
    { value: 'all', label: 'All' },
  ];
  protected readonly columns = STATUSES;

  protected readonly period = signal<Period>('today');
  protected readonly view = signal<View>('list');
  protected readonly query = signal('');
  protected readonly priority = signal<Priority | 'all'>('all');
  protected readonly tagFilter = signal<string>('');
  protected readonly dragOver = signal<Status | null>(null);

  // Bulk selection
  protected readonly selectionMode = signal(false);
  protected readonly selectedIds = signal<Set<string>>(new Set());

  private ref = () => fromISO(this.store.today());

  protected readonly counts = computed(() => {
    const ref = this.ref();
    this.store.tasks();
    const open = (p: Period) => this.store.forPeriod(p, ref).filter((t) => t.status !== 'done').length;
    return { today: open('today'), week: open('week'), month: open('month'), all: open('all') };
  });

  protected readonly rangeLabel = computed(() => {
    const ref = this.ref();
    const f = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
    switch (this.period()) {
      case 'today': return new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' }).format(ref);
      case 'week': return `${f.format(startOfWeek(ref))} – ${f.format(endOfWeek(ref))}`;
      case 'month': return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(ref);
      default: return 'Everything, sorted by date';
    }
  });

  private readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const p = this.priority();
    const tf = this.tagFilter();
    const base = this.store.forPeriod(this.period(), this.ref());
    const extra = this.period() === 'today' ? this.store.overdue() : [];
    return [...extra, ...base]
      .filter((t, i, arr) => arr.findIndex((x) => x.id === t.id) === i)
      .filter((t) =>
        (p === 'all' || t.priority === p) &&
        (!q || (t.title + t.notes + t.category).toLowerCase().includes(q)) &&
        (!tf || (t.tagIds ?? []).includes(tf))
      );
  });

  protected readonly groups = computed(() => {
    const today = this.store.today();
    const map = new Map<string, Task[]>();
    for (const t of this.filtered()) map.set(t.dueDate, [...(map.get(t.dueDate) ?? []), t]);
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, tasks]) => ({
        date, tasks,
        label: relativeDay(date, today),
        late: date < today && tasks.some((t) => t.status !== 'done'),
      }));
  });

  protected readonly board = computed(() => {
    const out: Record<Status, Task[]> = { todo: [], doing: [], done: [] };
    for (const t of this.filtered()) out[t.status].push(t);
    return out;
  });

  protected readonly doneCount = computed(() => this.store.tasks().filter((t) => t.status === 'done').length);

  protected readonly allSelected = computed(() => {
    const visible = this.filtered().map((t) => t.id);
    return visible.length > 0 && visible.every((id) => this.selectedIds().has(id));
  });

  protected day(iso: string): string { return relativeDay(iso, this.store.today()); }

  // --- bulk selection ---
  protected enterSelection(): void { this.selectionMode.set(true); }
  protected exitSelection(): void { this.selectionMode.set(false); this.selectedIds.set(new Set()); }

  protected toggleSelect(id: string): void {
    this.selectedIds.update((set) => {
      const next = new Set(set);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  protected toggleSelectAll(): void {
    if (this.allSelected()) {
      this.selectedIds.set(new Set());
    } else {
      this.selectedIds.set(new Set(this.filtered().map((t) => t.id)));
    }
  }

  protected bulkComplete(): void {
    const ids = [...this.selectedIds()];
    this.store.setStatusMany(ids, 'done');
    this.toast.show(`${ids.length} task${ids.length !== 1 ? 's' : ''} marked as done`);
    this.exitSelection();
  }

  protected bulkUncomplete(): void {
    const ids = [...this.selectedIds()];
    this.store.setStatusMany(ids, 'todo');
    this.toast.show(`${ids.length} task${ids.length !== 1 ? 's' : ''} moved to To Do`);
    this.exitSelection();
  }

  protected bulkDelete(): void {
    const ids = [...this.selectedIds()];
    const n = this.store.removeMany(ids);
    this.toast.show(`${n} task${n !== 1 ? 's' : ''} deleted`, { type: 'info' });
    this.exitSelection();
  }

  // --- drag & drop ---
  protected drag(e: DragEvent, t: Task): void {
    e.dataTransfer?.setData('text/plain', t.id);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  }

  protected drop(e: DragEvent, status: Status): void {
    e.preventDefault();
    this.dragOver.set(null);
    const id = e.dataTransfer?.getData('text/plain');
    if (id) this.store.setStatus(id, status);
  }

  protected clearDone(): void {
    const n = this.store.clearCompleted();
    this.toast.show(`${n} completed ${n === 1 ? 'task' : 'tasks'} removed`, { type: 'info' });
  }
}
