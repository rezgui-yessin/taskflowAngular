import { ChangeDetectionStrategy, Component, HostListener, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IconComponent } from '../../shared/components/icon.component';
import { TaskDialogComponent } from '../../shared/components/task-dialog.component';
import { ToastHostComponent } from '../../shared/components/toast-host.component';
import { ReminderService } from '../../core/services/reminder.service';
import { SettingsService } from '../../core/services/settings.service';
import { TaskFormService } from '../../core/services/task-form.service';
import { TaskStore } from '../../core/services/task.store';
import { RealtimeService } from '../../core/services/realtime.service';
import { PomodoroService } from '../../core/services/pomodoro.service';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, FormsModule, IconComponent, TaskDialogComponent, ToastHostComponent, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
})
export class ShellComponent {
  protected readonly reminders = inject(ReminderService);
  protected readonly settings = inject(SettingsService);
  protected readonly form = inject(TaskFormService);
  protected readonly store = inject(TaskStore);
  protected readonly realtime = inject(RealtimeService);
  protected readonly pomodoro = inject(PomodoroService);

  protected readonly bellOpen = signal(false);

  protected readonly nav = [
    { path: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
    { path: '/tasks', label: 'Tasks', icon: 'tasks' },
    { path: '/habits', label: 'Habits', icon: 'flame' },
    { path: '/calendar', label: 'Calendar', icon: 'calendar' },
    { path: '/progress', label: 'Progress', icon: 'progress' },
    { path: '/settings', label: 'Settings', icon: 'settings' },
  ];

  protected readonly isDark = computed(() => this.settings.resolvedTheme() === 'dark');
  protected readonly openCount = computed(() => this.store.todayTasks().filter((t) => t.status !== 'done').length);

  protected toggleBell(): void {
    const open = !this.bellOpen();
    this.bellOpen.set(open);
    if (open) setTimeout(() => this.reminders.markAllRead(), 1200);
  }

  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    const el = e.target as HTMLElement;
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
    if (e.key === 'Escape') this.bellOpen.set(false);
    if (!typing && !e.metaKey && !e.ctrlKey && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      this.form.openNew();
    }
  }

  @HostListener('document:click', ['$event'])
  onDocClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    if (!target.closest('.bell-wrap')) this.bellOpen.set(false);
    if (!target.closest('.pomo-wrap')) this.pomodoro.close();
  }
}
