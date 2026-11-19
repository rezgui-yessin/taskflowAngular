import { Injectable, computed, inject, signal } from '@angular/core';
import { TaskStore } from './task.store';
import { ToastService } from './toast.service';
import { SettingsService } from './settings.service';
import { Task } from '../models/task.model';
import { dueTimestamp } from '../utils/date.utils';

export interface AppNotification {
  id: string;
  taskId: string;
  title: string;
  body: string;
  at: number;
  read: boolean;
}

const FIRED_KEY = 'taskflow.reminders.fired.v1';
const INBOX_KEY = 'taskflow.inbox.v1';
/** Don't fire reminders for tasks that are more than this overdue (e.g. app was closed for days). */
const GRACE_MS = 6 * 60 * 60 * 1000;

@Injectable({ providedIn: 'root' })
export class ReminderService {
  private readonly store = inject(TaskStore);
  private readonly toast = inject(ToastService);
  private readonly settings = inject(SettingsService);

  private readonly _inbox = signal<AppNotification[]>(this.read<AppNotification[]>(INBOX_KEY, []));
  private started = false;

  readonly inbox = this._inbox.asReadonly();
  readonly unread = computed(() => this._inbox().filter((n) => !n.read).length);

  readonly permission = signal<NotificationPermission | 'unsupported'>(
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
  );

  start(): void {
    if (this.started) return;
    this.started = true;
    // Another tab may add reminders to the bell: keep ours in sync.
    addEventListener('storage', (e) => {
      if (e.key === INBOX_KEY) this._inbox.set(this.read<AppNotification[]>(INBOX_KEY, []));
    });
    this.check();
    setInterval(() => this.check(), 15_000);
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && this.check());
  }

  async requestPermission(): Promise<boolean> {
    if (typeof Notification === 'undefined') return false;
    const result = await Notification.requestPermission();
    this.permission.set(result);
    return result === 'granted';
  }

  markAllRead(): void {
    this.setInbox(this._inbox().map((n) => ({ ...n, read: true })));
  }

  clearInbox(): void {
    this.setInbox([]);
  }

  /** Tasks with a reminder that is still ahead of us, soonest first. */
  upcoming(limit = 5): { task: Task; at: number }[] {
    const now = Date.now();
    return this.store
      .open()
      .filter((t) => t.reminderMinutes !== null)
      .map((t) => ({ task: t, at: this.reminderTime(t) }))
      .filter((x) => x.at > now)
      .sort((a, b) => a.at - b.at)
      .slice(0, limit);
  }

  testReminder(): void {
    this.notify({
      id: crypto.randomUUID(),
      taskId: '',
      title: 'Reminder test',
      body: 'Reminders are working. You will be notified like this.',
      at: Date.now(),
      read: false,
    });
  }

  private reminderTime(t: Task): number {
    const due = dueTimestamp(t.dueDate, t.dueTime ?? '09:00');
    return due - (t.reminderMinutes ?? 0) * 60_000;
  }

  private check(): void {
    const now = Date.now();
    const due: AppNotification[] = [];
    // Shared by all open tabs, so each reminder is claimed (and shown) by exactly one of them.
    const fired = new Set(this.read<string[]>(FIRED_KEY, []));
    let claimed = false;

    for (const t of this.store.open()) {
      if (t.reminderMinutes === null) continue;
      const at = this.reminderTime(t);
      const key = `${t.id}:${at}`;
      if (now < at || now - at > GRACE_MS || fired.has(key)) continue;

      fired.add(key);
      claimed = true;
      const when = t.dueTime ? `at ${t.dueTime}` : 'today';
      due.push({
        id: crypto.randomUUID(),
        taskId: t.id,
        title: t.title,
        body: t.reminderMinutes === 0 ? `Due now (${when})` : `Coming up ${when}`,
        at: now,
        read: false,
      });
    }

    if (!claimed) return;
    try {
      localStorage.setItem(FIRED_KEY, JSON.stringify([...fired].slice(-500)));
    } catch {
      /* ignore */
    }
    this.dispatch(due, now);
  }

  private dispatch(due: AppNotification[], now: number): void {
    if (due.length <= 2) {
      due.forEach((n) => this.notify(n));
      return;
    }
    // Several reminders at once (e.g. the app was closed): keep all in the bell, show one summary.
    this.setInbox([...due, ...this.read<AppNotification[]>(INBOX_KEY, [])].slice(0, 40));
    this.notify(
      {
        id: crypto.randomUUID(),
        taskId: '',
        title: `${due.length} reminders`,
        body: due.map((d) => d.title).slice(0, 3).join(', ') + (due.length > 3 ? '…' : ''),
        at: now,
        read: true,
      },
      false,
    );
  }

  private notify(n: AppNotification, addToInbox = true): void {
    if (addToInbox) this.setInbox([n, ...this.read<AppNotification[]>(INBOX_KEY, [])].slice(0, 40));
    this.toast.show(n.body, { title: n.title, type: 'info', duration: 7000 });

    const { sound, browserNotify } = this.settings.settings();
    if (sound) this.beep();
    if (browserNotify && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try {
        new Notification(n.title, { body: n.body, icon: 'icons/icon.svg', tag: n.id });
      } catch {
        /* some mobile browsers require the service worker API instead */
      }
    }
  }

  /** Short two-tone chime generated with Web Audio, so no audio file is needed. */
  private beep(): void {
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      [660, 880].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const t0 = ctx.currentTime + i * 0.16;
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(0.18, t0 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t0);
        osc.stop(t0 + 0.32);
      });
      setTimeout(() => ctx.close(), 900);
    } catch {
      /* audio blocked until user interaction */
    }
  }

  private setInbox(list: AppNotification[]): void {
    this._inbox.set(list);
    try {
      localStorage.setItem(INBOX_KEY, JSON.stringify(list));
    } catch {
      /* ignore */
    }
  }

  private read<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  }
}
