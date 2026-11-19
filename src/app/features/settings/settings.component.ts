import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { IconComponent } from '../../shared/components/icon.component';
import { ACCENTS, SettingsService, ThemeMode } from '../../core/services/settings.service';
import { ReminderService } from '../../core/services/reminder.service';
import { TaskStore } from '../../core/services/task.store';
import { ToastService } from '../../core/services/toast.service';
import { Task } from '../../core/models/task.model';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './settings.component.scss',
  template: `
    <section class="page narrow">
      <div class="page-head">
        <div><div class="eyebrow">Preferences</div><h1>Settings</h1></div>
      </div>

      <div class="card">
        <h2>Appearance</h2>
        <div class="row">
          <div><strong>Theme</strong><p class="muted">Match your device or pick one.</p></div>
          <div class="seg">
            @for (m of modes; track m) {
              <button class="seg-btn" [class.active]="s.settings().theme === m" (click)="s.patch({ theme: m })" style="text-transform: capitalize">{{ m }}</button>
            }
          </div>
        </div>
        <div class="row">
          <div><strong>Accent color</strong><p class="muted">Used for buttons, highlights and charts.</p></div>
          <div class="swatches">
            @for (a of accents; track a.value) {
              <button class="swatch" [style.background]="a.value" [class.on]="s.settings().accent === a.value" (click)="s.patch({ accent: a.value })" [attr.aria-label]="a.name" [title]="a.name">
                @if (s.settings().accent === a.value) { <app-icon name="check" [size]="16" [stroke]="3.5" /> }
              </button>
            }
          </div>
        </div>
      </div>

      <div class="card">
        <h2>Reminders</h2>
        <div class="row">
          <div><strong>Sound</strong><p class="muted">Play a chime when a reminder fires.</p></div>
          <button class="switch" [class.on]="s.settings().sound" role="switch" [attr.aria-checked]="s.settings().sound" aria-label="Reminder sound" (click)="s.patch({ sound: !s.settings().sound })"></button>
        </div>
        <div class="row">
          <div>
            <strong>Browser notifications</strong>
            <p class="muted">
              @switch (reminders.permission()) {
                @case ('unsupported') { Not supported on this browser. }
                @case ('denied') { Blocked. Allow notifications for this site in your browser settings. }
                @default { Get notified even when the tab is in the background. }
              }
            </p>
          </div>
          <button class="switch" [class.on]="s.settings().browserNotify && reminders.permission() === 'granted'" role="switch"
            [attr.aria-checked]="s.settings().browserNotify" aria-label="Browser notifications"
            [disabled]="reminders.permission() === 'unsupported' || reminders.permission() === 'denied'" (click)="toggleNotify()"></button>
        </div>
        <div class="row">
          <div><strong>Try it</strong><p class="muted">Send a test reminder now.</p></div>
          <button class="btn btn-sm" (click)="reminders.testReminder()"><app-icon name="bell" [size]="15" />Send test</button>
        </div>
      </div>

      <div class="card">
        <h2>Your data</h2>
        <p class="muted pad">Everything is stored on this device. Export a backup or move your tasks to another device.</p>
        <div class="btns">
          <button class="btn" (click)="export()"><app-icon name="download" [size]="16" />Export backup</button>
          <label class="btn">Import backup<input type="file" accept="application/json" hidden (change)="import($event)" /></label>
          <button class="btn btn-danger" (click)="wipe()"><app-icon name="trash" [size]="16" />Delete all tasks</button>
        </div>
      </div>
    </section>
  `,
})
export class SettingsComponent {
  protected readonly s = inject(SettingsService);
  protected readonly reminders = inject(ReminderService);
  private readonly store = inject(TaskStore);
  private readonly toast = inject(ToastService);

  protected readonly modes: ThemeMode[] = ['light', 'dark', 'system'];
  protected readonly accents = ACCENTS;

  protected async toggleNotify(): Promise<void> {
    if (this.s.settings().browserNotify) {
      this.s.patch({ browserNotify: false });
      return;
    }
    const ok = await this.reminders.requestPermission();
    this.s.patch({ browserNotify: ok });
    if (!ok) this.toast.show('Notification permission was not granted.', { type: 'warning' });
  }

  protected wipe(): void {
    if (!confirm('Delete ALL tasks? This removes the demo data too and cannot be undone. Tip: export a backup first.')) return;
    this.store.clearAll();
    this.toast.show('All tasks deleted', { type: 'info' });
  }

  protected export(): void {
    const blob = new Blob([JSON.stringify(this.store.tasks(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `taskflow-backup-${this.store.today()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  protected async import(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text()) as Task[];
      if (!Array.isArray(data) || data.some((t) => !t.id || !t.title || !t.dueDate)) throw new Error('bad');
      data.forEach((t) => this.store.restore(t));
      this.toast.show(`Imported ${data.length} tasks`);
    } catch {
      this.toast.show('That file is not a valid TaskFlow backup.', { type: 'error' });
    }
    input.value = '';
  }
}
