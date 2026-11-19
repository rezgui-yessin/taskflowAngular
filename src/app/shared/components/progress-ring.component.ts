import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

@Component({
  selector: 'app-progress-ring',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    :host { display: inline-grid; place-items: center; position: relative; flex: none; }
    .label { position: absolute; text-align: center; line-height: 1.1; }
    .pct { font-weight: 800; letter-spacing: -0.03em; }
    .cap { font-size: 0.7rem; opacity: 0.7; font-weight: 600; }
    .arc { transition: stroke-dashoffset 0.8s var(--ease); }
  `],
  template: `
    <svg [attr.width]="size()" [attr.height]="size()" [attr.viewBox]="'0 0 ' + size() + ' ' + size()">
      <circle [attr.cx]="c()" [attr.cy]="c()" [attr.r]="r()" fill="none" [attr.stroke]="track()" [attr.stroke-width]="thickness()" />
      <circle class="arc" [attr.cx]="c()" [attr.cy]="c()" [attr.r]="r()" fill="none"
        [attr.stroke]="color()" [attr.stroke-width]="thickness()" stroke-linecap="round"
        [attr.stroke-dasharray]="circ()" [attr.stroke-dashoffset]="offset()"
        [attr.transform]="'rotate(-90 ' + c() + ' ' + c() + ')'" />
    </svg>
    <div class="label">
      <div class="pct" [style.font-size.px]="size() * 0.26">{{ value() }}%</div>
      @if (caption()) { <div class="cap">{{ caption() }}</div> }
    </div>
  `,
})
export class ProgressRingComponent {
  readonly value = input(0);
  readonly size = input(120);
  readonly thickness = input(10);
  readonly caption = input('');
  readonly color = input('var(--accent)');
  readonly track = input('var(--surface-3)');

  protected readonly c = computed(() => this.size() / 2);
  protected readonly r = computed(() => (this.size() - this.thickness()) / 2);
  protected readonly circ = computed(() => 2 * Math.PI * this.r());
  protected readonly offset = computed(() => this.circ() * (1 - Math.min(100, Math.max(0, this.value())) / 100));
}
