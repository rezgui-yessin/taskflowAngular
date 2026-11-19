import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { IconComponent } from '../../shared/components/icon.component';
import { ProgressRingComponent } from '../../shared/components/progress-ring.component';
import { StatsService, Bucket } from '../../core/services/stats.service';

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
          <div class="eyebrow">Insights</div>
          <h1>Progress</h1>
          <p class="sub">See how consistently you finish what you plan.</p>
        </div>
      </div>

      <div class="rings">
        <div class="card ring-card"><app-progress-ring [value]="stats.day().pct" [size]="116" /><div><h3>Daily</h3><p class="muted">{{ stats.day().done }} of {{ stats.day().total }} tasks</p></div></div>
        <div class="card ring-card"><app-progress-ring [value]="stats.week().pct" [size]="116" color="var(--info)" /><div><h3>Weekly</h3><p class="muted">{{ stats.week().done }} of {{ stats.week().total }} tasks</p></div></div>
        <div class="card ring-card"><app-progress-ring [value]="stats.month().pct" [size]="116" color="var(--success)" /><div><h3>Monthly</h3><p class="muted">{{ stats.month().done }} of {{ stats.month().total }} tasks</p></div></div>
        <div class="card ring-card streak">
          <span class="flame"><app-icon name="flame" [size]="30" /></span>
          <div><h3>{{ stats.streak() }} day {{ stats.streak() === 1 ? 'streak' : 'streak' }}</h3><p class="muted">{{ stats.completedTotal() }} tasks completed in total</p></div>
        </div>
      </div>

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
}
