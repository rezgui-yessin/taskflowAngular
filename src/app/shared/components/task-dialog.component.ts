import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  CATEGORIES, PRIORITIES, REMINDER_OPTIONS, REPEATS, STATUSES, TAG_COLORS,
  Priority, Repeat, Status, Subtask, Tag
} from '../../core/models/task.model';
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
    .dialog { width: min(640px, 100%); max-height: min(92vh, 860px); display: flex; flex-direction: column; background: var(--surface); border: 1px solid var(--border); border-radius: 24px; box-shadow: var(--shadow-lg); animation: pop-in .3s var(--ease); }
    header { display: flex; align-items: center; justify-content: space-between; padding: 20px 24px 8px; gap: 10px; }
    .header-left { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; }
    .body { padding: 8px 24px 16px; overflow: auto; display: flex; flex-direction: column; gap: 16px; }
    .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    footer { display: flex; gap: 10px; justify-content: flex-end; padding: 16px 24px 20px; border-top: 1px solid var(--border); flex-wrap: wrap; }
    footer .spacer { flex: 1; }
    .title-in { height: 50px; font-size: 1.05rem; font-weight: 600; }
    .chips { display: flex; gap: 6px; flex-wrap: wrap; }
    .chip { height: 34px; padding: 0 14px; border-radius: var(--radius-pill); border: 1px solid var(--border); background: var(--surface-2); font-weight: 600; font-size: .84rem; cursor: pointer; text-transform: capitalize; transition: all .15s; }
    .chip:hover { border-color: var(--accent-mid); }
    .chip.on { background: var(--accent-soft); border-color: var(--accent); color: var(--accent); }
    /* Subtask rows */
    .sub { display: flex; align-items: center; gap: 8px; }
    .sub input[type=checkbox] { width: 18px; height: 18px; accent-color: var(--accent); flex: none; }
    .sub .input { height: 36px; }
    .sub-children { padding-left: 28px; display: flex; flex-direction: column; gap: 6px; margin-top: 4px; }
    .sub-row { display: flex; flex-direction: column; gap: 4px; }
    .add-child-btn { font-size: .76rem; color: var(--accent); background: none; border: none; cursor: pointer; padding: 0 2px; }
    /* Tags */
    .tag-list { display: flex; flex-wrap: wrap; gap: 6px; }
    .tag-pill { display: inline-flex; align-items: center; gap: 5px; height: 28px; padding: 0 10px; border-radius: var(--radius-pill); font-size: .78rem; font-weight: 650; cursor: pointer; border: 1.5px solid transparent; transition: all .15s; }
    .tag-pill.selected { border-color: currentColor; }
    .tag-pill app-icon { opacity: .7; }
    .color-row { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
    .color-dot { width: 22px; height: 22px; border-radius: 50%; border: 2px solid transparent; cursor: pointer; transition: transform .15s; }
    .color-dot:hover, .color-dot.on { transform: scale(1.2); border-color: #fff; outline: 2px solid currentColor; }
    .new-tag-row { display: flex; gap: 6px; align-items: center; margin-top: 6px; }
    .new-tag-row .input { height: 34px; font-size: .84rem; }
    /* Dependencies */
    .dep-list { display: flex; flex-direction: column; gap: 4px; max-height: 160px; overflow-y: auto; }
    .dep-item { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-radius: 9px; background: var(--surface-2); font-size: .84rem; cursor: pointer; transition: background .12s; }
    .dep-item:hover { background: var(--surface-3); }
    .dep-item input[type=checkbox] { accent-color: var(--accent); }
    .dep-badge { font-size: .7rem; padding: 1px 7px; border-radius: var(--radius-pill); font-weight: 650; }
    .dep-badge.blocked { background: color-mix(in srgb, var(--danger) 14%, transparent); color: var(--danger); }
    /* Template row */
    .tpl-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .tpl-chip { height: 30px; padding: 0 12px; border-radius: var(--radius-pill); border: 1px dashed var(--border); background: transparent; font-size: .8rem; font-weight: 600; cursor: pointer; color: var(--text-2); transition: all .15s; }
    .tpl-chip:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }
    .tpl-chip.save-tpl { color: var(--accent); border-color: var(--accent-mid); }
    /* Blocked warning */
    .blocked-warn { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 10px; background: color-mix(in srgb, var(--warning) 12%, transparent); color: color-mix(in srgb, var(--warning) 80%, black); font-size: .84rem; font-weight: 600; }
    @keyframes fade { from { opacity: 0 } }
    @media (max-width: 560px) { .grid2 { grid-template-columns: 1fr; } .backdrop { align-items: end; padding: 0; } .dialog { border-radius: 24px 24px 0 0; max-height: 94vh; } }
  `],
  template: `
    @if (form.isOpen()) {
      <div class="backdrop" (mousedown)="onBackdrop($event)" (keydown.escape)="form.close()">
        <form class="dialog" role="dialog" aria-modal="true" [attr.aria-label]="form.editing() ? 'Edit task' : 'New task'" (ngSubmit)="save()" #f="ngForm">
          <header>
            <div class="header-left">
              <h2>{{ form.editing() ? 'Edit task' : 'New task' }}</h2>
              @if (templates().length) {
                <select class="select select-sm" style="height:30px;font-size:.8rem;width:auto;min-width:140px" aria-label="Load template" (change)="loadTemplate($any($event.target).value); $any($event.target).value=''">
                  <option value="">📋 Template…</option>
                  @for (tpl of templates(); track tpl.id) {
                    <option [value]="tpl.id">{{ tpl.name }}</option>
                  }
                </select>
              }
            </div>
            <button type="button" class="btn btn-icon" (click)="form.close()" aria-label="Close"><app-icon name="x" /></button>
          </header>

          <div class="body">
            <!-- Title -->
            <div class="field">
              <input class="input title-in" name="title" [(ngModel)]="title" placeholder="What do you need to do?" required maxlength="140" autofocus [class.invalid]="submitted() && !title.trim()" />
            </div>

            <!-- Notes -->
            <div class="field">
              <label for="notes">Notes</label>
              <textarea id="notes" class="textarea" name="notes" [(ngModel)]="notes" placeholder="Add details…"></textarea>
            </div>

            <!-- Date + Time -->
            <div class="grid2">
              <div class="field"><label for="date">Date</label><input id="date" class="input" type="date" name="date" [(ngModel)]="dueDate" required /></div>
              <div class="field"><label for="time">Time (optional)</label><input id="time" class="input" type="time" name="time" [(ngModel)]="dueTime" /></div>
            </div>

            <!-- Repeat -->
            <div class="field">
              <span class="label">Repeat</span>
              <div class="chips">
                @for (r of repeats; track r.value) {
                  <button type="button" class="chip" [class.on]="repeat() === r.value" (click)="repeat.set(r.value)">{{ r.label }}</button>
                }
              </div>
            </div>

            <!-- Priority -->
            <div class="field">
              <span class="label">Priority</span>
              <div class="chips">
                @for (p of priorities; track p) {
                  <button type="button" class="chip" [class.on]="priority() === p" (click)="priority.set(p)">{{ p }}</button>
                }
              </div>
            </div>

            <!-- Category + Reminder -->
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

            <!-- Status (edit only) -->
            @if (editing()) {
              <div class="field">
                <label for="st">Status</label>
                <select id="st" class="select" name="st" [(ngModel)]="status">
                  @for (s of statuses; track s.value) { <option [value]="s.value">{{ s.label }}</option> }
                </select>
              </div>
            }

            <!-- Tracked Time Spent -->
            <div class="field">
              <label for="timeSpent">Time Spent (logged)</label>
              <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
                <input id="timeSpent" class="input" type="number" min="0" step="5" [(ngModel)]="timeSpentMinutes" name="timeSpent" style="width:130px;height:36px" />
                <span class="muted" style="font-size:.82rem">{{ formatSpent(timeSpentMinutes) }}</span>
                <span style="flex:1"></span>
                <button type="button" class="btn btn-sm" (click)="addTime(15)">+15m</button>
                <button type="button" class="btn btn-sm" (click)="addTime(30)">+30m</button>
                <button type="button" class="btn btn-sm" (click)="addTime(60)">+1h</button>
              </div>
            </div>

            <!-- Tags -->
            <div class="field">
              <span class="label">Tags</span>
              <div class="tag-list">
                @for (tag of allTags(); track tag.id) {
                  <span class="tag-pill" [class.selected]="selectedTagIds().has(tag.id)"
                    [style.background]="selectedTagIds().has(tag.id) ? tag.color + '22' : 'var(--surface-2)'"
                    [style.color]="tag.color"
                    (click)="toggleTag(tag.id)">
                    @if (selectedTagIds().has(tag.id)) { <app-icon name="check" [size]="11" [stroke]="3" /> }
                    {{ tag.label }}
                  </span>
                }
              </div>
              <!-- New tag creator -->
              <div class="new-tag-row">
                <input class="input" [(ngModel)]="newTagLabel" name="newTagLabel" placeholder="New tag name…" style="height:34px;font-size:.84rem" (keydown.enter)="$event.preventDefault(); createTag()" maxlength="24" />
                <div class="color-row">
                  @for (c of tagColors; track c) {
                    <span class="color-dot" [class.on]="newTagColor() === c" [style.background]="c" [style.outlineColor]="c" (click)="newTagColor.set(c)" [title]="c"></span>
                  }
                </div>
                <button type="button" class="btn btn-sm" (click)="createTag()" [disabled]="!newTagLabel.trim()">Add tag</button>
              </div>
            </div>

            <!-- Task Dependencies -->
            <div class="field">
              <span class="label">Depends on (must finish first)</span>
              @if (otherTasks().length) {
                <div class="dep-list">
                  @for (t of otherTasks(); track t.id) {
                    <label class="dep-item">
                      <input type="checkbox" [checked]="selectedDeps().has(t.id)" (change)="toggleDep(t.id)" />
                      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ t.title }}</span>
                      <span class="dep-badge" [class.blocked]="t.status !== 'done'" [style.background]="t.status === 'done' ? 'color-mix(in srgb, var(--success) 14%, transparent)' : ''" [style.color]="t.status === 'done' ? 'var(--success)' : ''">{{ t.status }}</span>
                    </label>
                  }
                </div>
              } @else {
                <span class="faint" style="font-size:.82rem">No other tasks available</span>
              }
            </div>

            <!-- Subtasks / Checklist with nested children -->
            <div class="field">
              <span class="label">Checklist</span>
              @for (s of subtasks(); track s.id) {
                <div class="sub-row">
                  <div class="sub">
                    <input type="checkbox" [checked]="s.done" (change)="toggleSub(s.id)" [attr.aria-label]="'Done: ' + s.title" />
                    <input class="input" [value]="s.title" (input)="renameSub(s.id, $any($event.target).value)" [attr.aria-label]="'Subtask ' + s.title" />
                    <button type="button" class="add-child-btn" (click)="addChild(s.id)" title="Add nested step">+ nest</button>
                    <button type="button" class="btn btn-icon" (click)="removeSub(s.id)" aria-label="Remove subtask"><app-icon name="x" [size]="16" /></button>
                  </div>
                  <!-- Nested children -->
                  @if (s.children?.length) {
                    <div class="sub-children">
                      @for (c of s.children!; track c.id) {
                        <div class="sub">
                          <input type="checkbox" [checked]="c.done" (change)="toggleChild(s.id, c.id)" />
                          <input class="input" [value]="c.title" (input)="renameChild(s.id, c.id, $any($event.target).value)" />
                          <button type="button" class="btn btn-icon" (click)="removeChild(s.id, c.id)"><app-icon name="x" [size]="14" /></button>
                        </div>
                      }
                    </div>
                  }
                </div>
              }
              <div class="sub" style="margin-top:4px">
                <input class="input" [(ngModel)]="newSub" name="newSub" placeholder="Add a step and press Enter" (keydown.enter)="$event.preventDefault(); addSub()" />
                <button type="button" class="btn btn-sm" (click)="addSub()">Add</button>
              </div>
            </div>
          </div>

          <footer>
            @if (form.editing()) {
              <button type="button" class="btn btn-danger" (click)="remove()"><app-icon name="trash" [size]="16" />Delete</button>
              <button type="button" class="btn" (click)="saveAsTemplate()" title="Save current task as a reusable template"><app-icon name="copy" [size]="15" />Save as template</button>
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
  protected readonly tagColors = TAG_COLORS;

  protected title = '';
  protected notes = '';
  protected dueDate = '';
  protected dueTime = '';
  protected category = 'Personal';
  protected reminder: number | null = null;
  protected status: Status = 'todo';
  protected timeSpentMinutes = 0;
  protected newSub = '';
  protected newTagLabel = '';

  protected readonly repeat = signal<Repeat>('none');
  protected readonly priority = signal<Priority>('medium');
  protected readonly subtasks = signal<Subtask[]>([]);
  protected readonly submitted = signal(false);
  protected readonly editing = () => this.form.editing() !== null;
  protected readonly selectedTagIds = signal<Set<string>>(new Set());
  protected readonly selectedDeps = signal<Set<string>>(new Set());
  protected readonly newTagColor = signal<string>(TAG_COLORS[0]);

  protected readonly allTags = this.store.tags;
  protected readonly templates = this.store.templates;

  protected readonly otherTasks = computed(() => {
    const editingId = this.form.editing()?.id;
    return this.store.tasks().filter((t) => t.id !== editingId && t.status !== 'done').slice(0, 50);
  });

  constructor() {
    effect(() => {
      if (!this.form.isOpen()) return;
      const t = this.form.editing();
      const date = this.form.defaultDate();
      this.submitted.set(false);
      this.newSub = '';
      this.newTagLabel = '';
      this.title = t?.title ?? '';
      this.notes = t?.notes ?? '';
      this.dueDate = t?.dueDate ?? date ?? this.store.today();
      this.dueTime = t?.dueTime ?? '';
      this.category = t?.category ?? 'Personal';
      this.reminder = t?.reminderMinutes ?? null;
      this.status = t?.status ?? 'todo';
      this.timeSpentMinutes = t?.timeSpentMinutes ?? 0;
      this.repeat.set(t?.repeat ?? 'none');
      this.priority.set(t?.priority ?? 'medium');
      this.subtasks.set(t ? t.subtasks.map((s) => ({ ...s, children: s.children ? [...s.children] : [] })) : []);
      this.selectedTagIds.set(new Set(t?.tagIds ?? []));
      this.selectedDeps.set(new Set(t?.dependsOn ?? []));
    }, { allowSignalWrites: true });
  }

  protected onBackdrop(e: MouseEvent): void {
    if (e.target === e.currentTarget) this.form.close();
  }

  // --- subtask ops ---
  protected addSub(): void {
    const title = this.newSub.trim();
    if (!title) return;
    this.subtasks.update((l) => [...l, { id: crypto.randomUUID(), title, done: false, children: [] }]);
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

  // --- nested child ops ---
  protected addChild(parentId: string): void {
    this.subtasks.update((l) =>
      l.map((s) =>
        s.id === parentId
          ? { ...s, children: [...(s.children ?? []), { id: crypto.randomUUID(), title: '', done: false }] }
          : s
      )
    );
  }
  protected toggleChild(parentId: string, childId: string): void {
    this.subtasks.update((l) =>
      l.map((s) =>
        s.id === parentId
          ? { ...s, children: (s.children ?? []).map((c) => (c.id === childId ? { ...c, done: !c.done } : c)) }
          : s
      )
    );
  }
  protected renameChild(parentId: string, childId: string, title: string): void {
    this.subtasks.update((l) =>
      l.map((s) =>
        s.id === parentId
          ? { ...s, children: (s.children ?? []).map((c) => (c.id === childId ? { ...c, title } : c)) }
          : s
      )
    );
  }
  protected removeChild(parentId: string, childId: string): void {
    this.subtasks.update((l) =>
      l.map((s) =>
        s.id === parentId
          ? { ...s, children: (s.children ?? []).filter((c) => c.id !== childId) }
          : s
      )
    );
  }

  // --- tag ops ---
  protected toggleTag(id: string): void {
    this.selectedTagIds.update((set) => {
      const next = new Set(set);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  protected createTag(): void {
    const label = this.newTagLabel.trim();
    if (!label) return;
    const tag = this.store.addTag(label, this.newTagColor());
    this.selectedTagIds.update((set) => new Set([...set, tag.id]));
    this.newTagLabel = '';
    this.newTagColor.set(TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)]);
  }

  // --- dependency ops ---
  protected toggleDep(id: string): void {
    this.selectedDeps.update((set) => {
      const next = new Set(set);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // --- template ops ---
  protected loadTemplate(templateId: string): void {
    if (!templateId) return;
    const tpl = this.store.templates().find((t) => t.id === templateId);
    if (!tpl) return;
    const data = this.store.applyTemplate(tpl, this.dueDate || undefined);
    this.title = data.title ?? '';
    this.notes = data.notes ?? '';
    this.category = data.category ?? 'Personal';
    this.reminder = data.reminderMinutes ?? null;
    this.repeat.set(data.repeat ?? 'none');
    this.priority.set(data.priority ?? 'medium');
    this.dueTime = data.dueTime ?? '';
    this.subtasks.set((data.subtasks ?? []).map((s) => ({ ...s, children: s.children ?? [] })));
    this.selectedTagIds.set(new Set(data.tagIds ?? []));
    this.toast.show(`Template "${tpl.name}" loaded`);
  }

  protected saveAsTemplate(): void {
    const t = this.form.editing();
    if (!t) return;
    const name = prompt('Template name:', t.title);
    if (!name?.trim()) return;
    this.store.saveTemplate(name, t);
    this.toast.show(`Template "${name}" saved`);
  }

  protected addTime(m: number): void {
    this.timeSpentMinutes = (Number(this.timeSpentMinutes) || 0) + m;
  }

  protected formatSpent(m: number): string {
    const mins = Number(m) || 0;
    if (mins >= 60) {
      const h = Math.floor(mins / 60);
      const rem = mins % 60;
      return rem ? `(${h}h ${rem}m)` : `(${h}h)`;
    }
    return mins > 0 ? `(${mins}m)` : '';
  }

  // --- save / remove ---
  protected save(): void {
    this.submitted.set(true);
    if (!this.title.trim() || !this.dueDate) return;

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
      tagIds: [...this.selectedTagIds()],
      dependsOn: [...this.selectedDeps()],
      timeSpentMinutes: Number(this.timeSpentMinutes) || 0,
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
