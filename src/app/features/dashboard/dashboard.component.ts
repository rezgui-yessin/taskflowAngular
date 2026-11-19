import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { IconComponent } from '../../shared/components/icon.component';
import { ProgressRingComponent } from '../../shared/components/progress-ring.component';
import { TaskItemComponent } from '../../shared/components/task-item.component';
import { StatsService } from '../../core/services/stats.service';
import { TaskStore } from '../../core/services/task.store';
import { TaskFormService } from '../../core/services/task-form.service';
import { ReminderService } from '../../core/services/reminder.service';
import { fromISO } from '../../core/utils/date.utils';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, DatePipe, IconComponent, ProgressRingComponent, TaskItemComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './dashboard.component.scss',
  template: `
    <section class="page">
      <div class="page-head">
        <div>
          <div class="eyebrow">{{ today() | date: 'EEEE, d MMMM' }}</div>
          <h1>{{ greeting() }} 👋</h1>
          <p class="sub">{{ summaryLine() }}</p>
        </div>
        <button class="btn btn-primary" (click)="form.openNew()"><app-icon name="plus" [size]="18" [stroke]="2.5" /> New task</button>
      </div>

      <div class="kpis">
        <div class="card kpi hero">
          <app-progress-ring [value]="stats.day().pct" [size]="132" [thickness]="12" caption="today" color="#fff" track="rgb(255 255 255 / 28%)" />
          <div>
            <div class="k-label">Today's progress</div>
            <div class="k-big">{{ stats.day().done }}<span>/{{ stats.day().total }}</span></div>
            <div class="k-note">tasks completed</div>
          </div>
        </div>

        <div class="card kpi">
          <div class="k-top"><span class="k-ic"><app-icon name="calendar" [size]="18" /></span> This week</div>
          <div class="k-big">{{ stats.week().pct }}<span>%</span></div>
          <div class="meter"><i [style.width.%]="stats.week().pct"></i></div>
          <div class="k-note">{{ stats.week().done }} of {{ stats.week().total }} done</div>
        </div>

        <div class="card kpi">
          <div class="k-top"><span class="k-ic m"><app-icon name="target" [size]="18" /></span> This month</div>
          <div class="k-big">{{ stats.month().pct }}<span>%</span></div>
          <div class="meter"><i [style.width.%]="stats.month().pct"></i></div>
          <div class="k-note">{{ stats.month().done }} of {{ stats.month().total }} done</div>
        </div>

        <div class="card kpi">
          <div class="k-top"><span class="k-ic s"><app-icon name="flame" [size]="18" /></span> Streak</div>
          <div class="k-big">{{ stats.streak() }}<span> {{ stats.streak() === 1 ? 'day' : 'days' }}</span></div>
          <div class="k-note">{{ stats.streak() ? 'Keep it going!' : 'Complete a task to start' }}</div>
        </div>
      </div>

      <div class="cols">
        <div class="card">
          <div class="card-head">
            <h2>Today</h2>
            <a routerLink="/tasks">View all</a>
          </div>
          <div class="list">
            @for (t of store.todayTasks(); track t.id) { <app-task-item [task]="t" /> }
            @empty {
              <div class="empty">
                <div class="empty-ic"><app-icon name="sparkle" /></div>
                <strong>Nothing planned for today</strong>
                <span>Enjoy the free time or add a task.</span>
                <button class="btn btn-sm btn-primary" (click)="form.openNew()">Add a task</button>
              </div>
            }
          </div>
        </div>

        <div class="side">
          @if (store.overdue().length) {
            <div class="card warn">
              <div class="card-head"><h2><app-icon name="alert" [size]="16" /> Overdue</h2><span class="badge" data-p="high">{{ store.overdue().length }}</span></div>
              <div class="list">
                @for (t of store.overdue().slice(0, 3); track t.id) { <app-task-item [task]="t" /> }
              </div>
            </div>
          }

          <div class="card">
            <div class="card-head"><h2>Next reminders</h2></div>
            <div class="rem-list">
              @for (r of upcoming(); track r.task.id) {
                <div class="rem">
                  <span class="rem-ic"><app-icon name="bell" [size]="15" /></span>
                  <div class="rem-main"><div class="rem-t">{{ r.task.title }}</div><div class="faint">{{ r.at | date: 'EEE d MMM, HH:mm' }}</div></div>
                </div>
              } @empty { <p class="muted">No upcoming reminders.</p> }
            </div>
          </div>

          <div class="card">
            <div class="card-head">
              <h2><app-icon name="flame" [size]="16" /> Habits today</h2>
              <a routerLink="/habits">Track all</a>
            </div>
            <div class="habit-mini-list">
              @for (h of store.habits(); track h.id) {
                <div class="habit-mini-item" (click)="store.toggleHabitDay(h.id, store.today())">
                  <span class="day-check-mini" [class.checked]="h.completedDates.includes(store.today())" [style.--c]="h.color">
                    @if (h.completedDates.includes(store.today())) {
                      <app-icon name="check" [size]="12" [stroke]="3" />
                    }
                  </span>
                  <span class="habit-mini-title" [class.done-t]="h.completedDates.includes(store.today())">{{ h.title }}</span>
                  <span class="faint" style="font-size:.74rem">🔥 {{ store.habitStreak(h) }}d</span>
                </div>
              } @empty {
                <p class="muted">No habits yet. <a routerLink="/habits">Add one!</a></p>
              }
            </div>
          </div>
        </div>
      </div>
    </section>
  `,
})
export class DashboardComponent {
  protected readonly stats = inject(StatsService);
  protected readonly store = inject(TaskStore);
  protected readonly form = inject(TaskFormService);
  private readonly reminders = inject(ReminderService);

  protected readonly today = computed(() => fromISO(this.store.today()));
  protected readonly upcoming = computed(() => {
    this.store.tasks(); // recompute when tasks change
    return this.reminders.upcoming(4);
  });

  protected readonly greeting = computed(() => {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  });

  protected readonly summaryLine = computed(() => {
    const { total, done } = this.stats.day();
    if (!total) return 'Your day is clear. Add something worth doing.';
    if (done === total) return 'All done for today. Great work!';
    return `${total - done} ${total - done === 1 ? 'task' : 'tasks'} left for today.`;
  });
}
