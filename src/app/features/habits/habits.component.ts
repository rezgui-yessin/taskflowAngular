import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { IconComponent } from '../../shared/components/icon.component';
import { Habit, CATEGORIES, TAG_COLORS } from '../../core/models/task.model';
import { TaskStore } from '../../core/services/task.store';
import { ToastService } from '../../core/services/toast.service';
import { addDays, fromISO, startOfWeek, toISO, weekdayShort } from '../../core/utils/date.utils';

@Component({
  selector: 'app-habits',
  standalone: true,
  imports: [FormsModule, IconComponent, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './habits.component.scss',
  template: `
    <section class="page">
      <div class="page-head">
        <div>
          <div class="eyebrow">Productivity & Routines</div>
          <h1>Habits</h1>
          <p class="sub">Build streak-based habits and track consistency week over week.</p>
        </div>
        <button class="btn btn-primary" (click)="showNewForm.set(true)">
          <app-icon name="plus" [size]="18" [stroke]="2.5" /> New habit
        </button>
      </div>

      <!-- Quick Stats -->
      <div class="stats-row">
        <div class="card stat-card">
          <div class="stat-ic" style="background:var(--accent-soft);color:var(--accent)"><app-icon name="check" [size]="22" [stroke]="3" /></div>
          <div>
            <div class="stat-num">{{ todayCompleted() }} / {{ habits().length }}</div>
            <div class="stat-lbl">Done today ({{ todayPct() }}%)</div>
          </div>
        </div>

        <div class="card stat-card">
          <div class="stat-ic" style="background:color-mix(in srgb, var(--warning) 16%, transparent);color:var(--warning)"><app-icon name="flame" [size]="22" /></div>
          <div>
            <div class="stat-num">{{ bestStreak() }} days</div>
            <div class="stat-lbl">Best active streak</div>
          </div>
        </div>

        <div class="card stat-card">
          <div class="stat-ic" style="background:color-mix(in srgb, var(--success) 16%, transparent);color:var(--success)"><app-icon name="target" [size]="22" /></div>
          <div>
            <div class="stat-num">{{ weekTotalCheckmarks() }} check-ins</div>
            <div class="stat-lbl">Completed this week</div>
          </div>
        </div>
      </div>

      <!-- New Habit Form Modal/Card -->
      @if (showNewForm()) {
        <div class="card new-card">
          <div class="card-head">
            <h3>New habit</h3>
            <button class="btn btn-icon" (click)="showNewForm.set(false)"><app-icon name="x" [size]="18" /></button>
          </div>
          <form (ngSubmit)="createHabit()">
            <div class="form-row">
              <input class="input" [(ngModel)]="newTitle" name="newTitle" placeholder="e.g. Read 20 minutes, Drink 2L water…" required autofocus />
              <select class="select" [(ngModel)]="newCategory" name="newCategory" style="width:160px">
                @for (c of categories; track c) { <option [value]="c">{{ c }}</option> }
              </select>
              <select class="select" [(ngModel)]="newTarget" name="newTarget" style="width:150px">
                <option [ngValue]="7">7 days/week</option>
                <option [ngValue]="6">6 days/week</option>
                <option [ngValue]="5">5 days (Mon-Fri)</option>
                <option [ngValue]="3">3 days/week</option>
                <option [ngValue]="1">1 day/week</option>
              </select>
            </div>
            <div class="color-row">
              <span class="label" style="font-size:.8rem;font-weight:600;color:var(--text-2);margin-right:8px">Color:</span>
              @for (c of tagColors; track c) {
                <button type="button" class="color-dot" [class.on]="newColor() === c" [style.background]="c" (click)="newColor.set(c)"></button>
              }
              <span style="flex:1"></span>
              <button type="button" class="btn btn-sm btn-ghost" (click)="showNewForm.set(false)">Cancel</button>
              <button type="submit" class="btn btn-sm btn-primary" [disabled]="!newTitle.trim()">Save habit</button>
            </div>
          </form>
        </div>
      }

      <!-- Habits Grid / Tracker -->
      <div class="card habit-table-card">
        <div class="card-head">
          <div>
            <h2>Weekly Routine Tracker</h2>
            <p class="muted small">Check off daily habits to maintain your streaks</p>
          </div>
        </div>

        <div class="habit-table">
          <!-- Header Row -->
          <div class="table-head">
            <div class="col-habit">Habit</div>
            <div class="col-streak">Streak</div>
            <div class="col-days">
              @for (d of weekDays(); track d.iso) {
                <div class="day-header" [class.today]="d.isToday">
                  <span class="day-name">{{ d.name }}</span>
                  <span class="day-num">{{ d.date }}</span>
                </div>
              }
            </div>
            <div class="col-actions"></div>
          </div>

          <!-- Habit Rows -->
          @for (h of habits(); track h.id) {
            <div class="habit-row">
              <!-- Habit Info -->
              <div class="col-habit">
                <span class="h-dot" [style.background]="h.color"></span>
                <div>
                  <div class="h-title">{{ h.title }}</div>
                  <div class="h-meta">
                    <span class="muted">{{ h.category }}</span> ·
                    <span class="faint">{{ completedThisWeek(h) }}/{{ h.targetDaysPerWeek }} this week</span>
                  </div>
                </div>
              </div>

              <!-- Streak -->
              <div class="col-streak">
                <span class="streak-badge" [class.active]="streak(h) > 0">
                  <app-icon name="flame" [size]="14" /> {{ streak(h) }} {{ streak(h) === 1 ? 'day' : 'days' }}
                </span>
              </div>

              <!-- 7 Day Circles -->
              <div class="col-days">
                @for (d of weekDays(); track d.iso) {
                  <button
                    type="button"
                    class="day-check"
                    [class.checked]="isDone(h, d.iso)"
                    [class.today]="d.isToday"
                    [style.--habit-c]="h.color"
                    (click)="toggleDay(h.id, d.iso)"
                    [title]="h.title + ' on ' + d.iso">
                    @if (isDone(h, d.iso)) {
                      <app-icon name="check" [size]="14" [stroke]="3" />
                    }
                  </button>
                }
              </div>

              <!-- Actions -->
              <div class="col-actions">
                <button type="button" class="btn btn-icon btn-sm" (click)="deleteHabit(h)" title="Delete habit">
                  <app-icon name="trash" [size]="15" />
                </button>
              </div>
            </div>
          } @empty {
            <div class="empty">
              <div class="empty-ic"><app-icon name="sparkle" /></div>
              <strong>No habits tracked yet</strong>
              <span>Add your daily routines to start tracking streaks!</span>
              <button class="btn btn-primary btn-sm" (click)="showNewForm.set(true)">Create your first habit</button>
            </div>
          }
        </div>
      </div>
    </section>
  `,
})
export class HabitsComponent {
  protected readonly store = inject(TaskStore);
  private readonly toast = inject(ToastService);

  protected readonly categories = CATEGORIES;
  protected readonly tagColors = TAG_COLORS;

  protected readonly habits = this.store.habits;
  protected readonly showNewForm = signal(false);

  protected newTitle = '';
  protected newCategory = 'Health';
  protected newTarget = 7;
  protected readonly newColor = signal<string>(TAG_COLORS[5]); // Emerald green

  // Current Week (Mon to Sun)
  protected readonly weekDays = computed(() => {
    const todayIso = this.store.today();
    const today = fromISO(todayIso);
    const start = startOfWeek(today);

    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(start, i);
      const iso = toISO(d);
      return {
        name: weekdayShort(d),
        date: d.getDate(),
        iso,
        isToday: iso === todayIso,
      };
    });
  });

  protected readonly todayCompleted = computed(() => {
    const today = this.store.today();
    return this.habits().filter((h) => h.completedDates.includes(today)).length;
  });

  protected readonly todayPct = computed(() => {
    const total = this.habits().length;
    if (!total) return 0;
    return Math.round((this.todayCompleted() / total) * 100);
  });

  protected readonly bestStreak = computed(() => {
    let best = 0;
    for (const h of this.habits()) {
      const s = this.store.habitStreak(h);
      if (s > best) best = s;
    }
    return best;
  });

  protected readonly weekTotalCheckmarks = computed(() => {
    const days = new Set(this.weekDays().map((w) => w.iso));
    let total = 0;
    for (const h of this.habits()) {
      for (const d of h.completedDates) {
        if (days.has(d)) total++;
      }
    }
    return total;
  });

  protected streak(h: Habit): number {
    return this.store.habitStreak(h);
  }

  protected isDone(h: Habit, iso: string): boolean {
    return h.completedDates.includes(iso);
  }

  protected completedThisWeek(h: Habit): number {
    const days = new Set(this.weekDays().map((w) => w.iso));
    return h.completedDates.filter((d) => days.has(d)).length;
  }

  protected toggleDay(habitId: string, isoDate: string): void {
    this.store.toggleHabitDay(habitId, isoDate);
  }

  protected createHabit(): void {
    if (!this.newTitle.trim()) return;
    this.store.addHabit(this.newTitle, this.newCategory, this.newColor(), this.newTarget);
    this.toast.show(`Habit "${this.newTitle.trim()}" created! 🎯`);
    this.newTitle = '';
    this.showNewForm.set(false);
  }

  protected deleteHabit(h: Habit): void {
    if (confirm(`Delete habit "${h.title}"?`)) {
      this.store.removeHabit(h.id);
      this.toast.show(`"${h.title}" deleted`, { type: 'info' });
    }
  }
}
