import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { IconComponent } from '../../shared/components/icon.component';
import { ProgressRingComponent } from '../../shared/components/progress-ring.component';
import { StatsService, Bucket } from '../../core/services/stats.service';
import { ToastService } from '../../core/services/toast.service';

type Range = 'daily' | 'weekly' | 'monthly';

@Component({
  selector: 'app-progress',
  standalone: true,
  imports: [IconComponent, ProgressRingComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './progress.component.scss',
  template: `
    <section class="page">
      <div class="page-head">
        <div>
          <div class="eyebrow">Insights & Analytics</div>
          <h1>Progress</h1>
          <p class="sub">Track consistency, hours logged, and your weekly digest.</p>
        </div>
      </div>

      <!-- Rings & Highlights -->
      <div class="rings">
        <div class="card ring-card"><app-progress-ring [value]="stats.day().pct" [size]="116" /><div><h3>Daily</h3><p class="muted">{{ stats.day().done }} of {{ stats.day().total }} tasks</p></div></div>
        <div class="card ring-card"><app-progress-ring [value]="stats.week().pct" [size]="116" color="var(--info)" /><div><h3>Weekly</h3><p class="muted">{{ stats.week().done }} of {{ stats.week().total }} tasks</p></div></div>
        <div class="card ring-card"><app-progress-ring [value]="stats.month().pct" [size]="116" color="var(--success)" /><div><h3>Monthly</h3><p class="muted">{{ stats.month().done }} of {{ stats.month().total }} tasks</p></div></div>
        <div class="card ring-card streak">
          <span class="flame"><app-icon name="flame" [size]="30" /></span>
          <div><h3>{{ stats.streak() }} day streak</h3><p class="muted">{{ stats.completedTotal() }} tasks done · {{ formatMinutes(stats.totalMinutesTracked()) }} logged</p></div>
        </div>
      </div>

      <!-- Auto-Generated Weekly Review Digest Card -->
      @let wr = stats.weeklyReview();
      <div class="card review-card">
        <div class="card-head">
          <div>
            <div class="eyebrow" style="color:var(--accent)">Auto-generated Digest</div>
            <h2>Weekly Review Summary</h2>
            <p class="muted small">{{ wr.startDate }} – {{ wr.endDate }}</p>
          </div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <span class="grade-badge" [attr.data-grade]="wr.grade">Grade: {{ wr.grade }} ({{ wr.productivityScore }}%)</span>
            <button type="button" class="btn btn-sm btn-ghost" (click)="copyDigest(wr.digestText)" title="Copy digest to clipboard">
              <app-icon name="copy" [size]="15" /> Copy review
            </button>
          </div>
        </div>

        <div class="review-grid">
          <div class="rev-stat">
            <span class="rev-num">{{ wr.tasksCompleted }}/{{ wr.tasksPlanned }}</span>
            <span class="rev-lbl">Tasks Done ({{ wr.completionRate }}%)</span>
          </div>

          <div class="rev-stat">
            <span class="rev-num">{{ formatMinutes(wr.totalMinutesSpent) }}</span>
            <span class="rev-lbl">Focus Time Tracked</span>
          </div>

          <div class="rev-stat">
            <span class="rev-num">{{ stats.streak() }} days</span>
            <span class="rev-lbl">Active Streak</span>
          </div>

          <div class="rev-stat">
            <span class="rev-num">{{ wr.topCategory ? wr.topCategory.name : '—' }}</span>
            <span class="rev-lbl">{{ wr.topCategory ? wr.topCategory.pct + '% of focus' : 'No tasks' }}</span>
          </div>
        </div>

        @if (wr.highlights.length) {
          <div class="rev-accomplishments">
            <strong>Key Accomplishments This Week</strong>
            <div class="rev-list">
              @for (t of wr.highlights; track t.id) {
                <div class="rev-item">
                  <span class="rev-chk"><app-icon name="check" [size]="13" [stroke]="3" /></span>
                  <span class="rev-t">{{ t.title }}</span>
                  <span class="badge" [attr.data-p]="t.priority">{{ t.category }}</span>
                  @if (t.timeSpentMinutes) {
                    <span class="faint" style="font-size:.76rem">⏱ {{ t.timeSpentMinutes }}m</span>
                  }
                </div>
              }
            </div>
          </div>
        }
      </div>

      <!-- Completion rate chart -->
      <div class="card">
        <div class="card-head">
          <div><h2>Completion rate</h2><p class="muted small">Share of planned tasks that were completed</p></div>
          <div class="seg" role="tablist">
            @for (r of ranges; track r.value) {
              <button class="seg-btn" role="tab" [class.active]="range() === r.value" [attr.aria-selected]="range() === r.value" (click)="range.set(r.value)">{{ r.label }}</button>
            }
          </div>
        </div>

        <div class="chart" role="img" [attr.aria-label]="'Completion rate chart, ' + range()">
          <div class="y"><span style="top:0">100%</span><span style="top:50%">50%</span><span style="top:100%">0%</span></div>
          <div class="plot">
            <div class="gl g1"></div><div class="gl g2"></div>
            <div class="bars" [style.grid-template-columns]="'repeat(' + buckets().length + ', 1fr)'">
              @for (b of buckets(); track b.label) {
                <div class="bar-col" [title]="b.done + ' of ' + b.total + ' done'">
                  <div class="bar-val">{{ b.total ? b.pct + '%' : '–' }}</div>
                  <div class="bar-track"><div class="bar" [class.cur]="b.isCurrent" [style.height.%]="b.pct"></div></div>
                  <div class="bar-label" [class.cur]="b.isCurrent">{{ b.label }}</div>
                  <div class="bar-sub">{{ b.done }}/{{ b.total }}</div>
                </div>
              }
            </div>
          </div>
        </div>
      </div>

      <!-- By Category -->
      <div class="card">
        <div class="card-head"><div><h2>By category</h2><p class="muted small">This month</p></div></div>
        <div class="cats">
          @for (c of stats.byCategory(); track c.name) {
            <div class="cat">
              <div class="cat-top"><strong>{{ c.name }}</strong><span class="muted">{{ c.done }}/{{ c.total }} · {{ c.pct }}%</span></div>
              <div class="meter"><i [style.width.%]="c.pct"></i></div>
            </div>
          } @empty { <p class="muted">No tasks this month yet.</p> }
        </div>
      </div>
    </section>
  `,
})
export class ProgressComponent {
  protected readonly stats = inject(StatsService);
  private readonly toast = inject(ToastService);

  protected readonly range = signal<Range>('daily');
  protected readonly ranges: { value: Range; label: string }[] = [
    { value: 'daily', label: 'Daily' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'monthly', label: 'Monthly' },
  ];

  protected readonly buckets = computed<Bucket[]>(() => {
    switch (this.range()) {
      case 'daily': return this.stats.last7();
      case 'weekly': return this.stats.last6Weeks();
      default: return this.stats.last6Months();
    }
  });

  protected formatMinutes(mins: number): string {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h > 0) return `${h}h ${m ? m + 'm' : ''}`;
    return `${m}m`;
  }

  protected copyDigest(text: string): void {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      this.toast.show('Weekly digest copied to clipboard! 📋');
    }
  }
}
