import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastService } from '../../core/services/toast.service';
import { IconComponent } from './icon.component';

@Component({
  selector: 'app-toast-host',
  standalone: true,
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    .host { position: fixed; right: 20px; bottom: 20px; z-index: 300; display: flex; flex-direction: column; gap: 10px; width: min(380px, calc(100vw - 32px)); }
    .toast { display: flex; gap: 12px; align-items: flex-start; padding: 13px 14px; border-radius: 14px; background: var(--surface); border: 1px solid var(--border); box-shadow: var(--shadow-lg); animation: pop-in 0.3s var(--ease); }
    .ic { flex: none; display: grid; place-items: center; width: 30px; height: 30px; border-radius: 10px; color: #fff; }
    .success .ic { background: var(--success); } .info .ic { background: var(--accent); }
    .warning .ic { background: var(--warning); } .error .ic { background: var(--danger); }
    .body { flex: 1; min-width: 0; } .t { font-weight: 700; } .m { color: var(--text-2); font-size: 0.88rem; }
    .act { border: 0; background: transparent; color: var(--accent); font-weight: 700; cursor: pointer; padding: 4px 6px; border-radius: 8px; }
    .act:hover { background: var(--accent-soft); }
    @media (max-width: 860px) { .host { bottom: 88px; right: 16px; } }
  `],
  template: `
    <div class="host" role="status" aria-live="polite">
      @for (t of toasts.toasts(); track t.id) {
        <div class="toast" [class]="'toast ' + t.type">
          <span class="ic"><app-icon [name]="t.type === 'info' ? 'bell' : t.type === 'success' ? 'check' : 'alert'" [size]="16" [stroke]="2.5" /></span>
          <div class="body">
            @if (t.title) { <div class="t">{{ t.title }}</div> }
            <div class="m">{{ t.message }}</div>
          </div>
          @if (t.actionLabel) { <button class="act" (click)="t.action?.(); toasts.dismiss(t.id)">{{ t.actionLabel }}</button> }
        </div>
      }
    </div>
  `,
})
export class ToastHostComponent {
  protected readonly toasts = inject(ToastService);
}
