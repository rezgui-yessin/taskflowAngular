import { Injectable, computed, inject, signal } from '@angular/core';
import { TaskStore } from './task.store';
import { ToastService } from './toast.service';

export type PomodoroMode = 'focus' | 'shortBreak' | 'longBreak';

export interface PomodoroConfig {
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
}

const DEFAULT_CONFIG: PomodoroConfig = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
};

@Injectable({ providedIn: 'root' })
export class PomodoroService {
  private readonly store = inject(TaskStore);
  private readonly toast = inject(ToastService);

  readonly config = signal<PomodoroConfig>(DEFAULT_CONFIG);
  readonly mode = signal<PomodoroMode>('focus');
  readonly isRunning = signal<boolean>(false);
  readonly activeTaskId = signal<string | null>(null);
  readonly isOpen = signal<boolean>(false);
  readonly completedSessions = signal<number>(0);

  // Time left in seconds
  readonly secondsLeft = signal<number>(DEFAULT_CONFIG.focusMinutes * 60);

  private timerInterval: any = null;

  readonly activeTask = computed(() => {
    const id = this.activeTaskId();
    return id ? this.store.byId(id) ?? null : null;
  });

  readonly totalSecondsForMode = computed(() => {
    const cfg = this.config();
    switch (this.mode()) {
      case 'focus': return cfg.focusMinutes * 60;
      case 'shortBreak': return cfg.shortBreakMinutes * 60;
      case 'longBreak': return cfg.longBreakMinutes * 60;
    }
  });

  readonly progressPct = computed(() => {
    const total = this.totalSecondsForMode();
    const left = this.secondsLeft();
    return Math.max(0, Math.min(100, Math.round(((total - left) / total) * 100)));
  });

  readonly displayTime = computed(() => {
    const s = this.secondsLeft();
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  });

  constructor() {
    // Keep document title updated when timer is running
    // e.g. "24:15 - Focus · TaskFlow"
  }

  open(taskId?: string): void {
    if (taskId) {
      this.activeTaskId.set(taskId);
    }
    this.isOpen.set(true);
  }

  close(): void {
    this.isOpen.set(false);
  }

  toggleOpen(): void {
    this.isOpen.update((v) => !v);
  }

  startTaskSession(taskId: string): void {
    this.activeTaskId.set(taskId);
    this.setMode('focus');
    this.start();
    this.isOpen.set(true);
  }

  setMode(mode: PomodoroMode): void {
    this.pause();
    this.mode.set(mode);
    const cfg = this.config();
    let mins = cfg.focusMinutes;
    if (mode === 'shortBreak') mins = cfg.shortBreakMinutes;
    if (mode === 'longBreak') mins = cfg.longBreakMinutes;
    this.secondsLeft.set(mins * 60);
  }

  setFocusDuration(minutes: number): void {
    this.pause();
    this.config.update((c) => ({ ...c, focusMinutes: minutes }));
    if (this.mode() === 'focus') {
      this.secondsLeft.set(minutes * 60);
    }
  }

  start(): void {
    if (this.isRunning()) return;
    this.isRunning.set(true);

    this.timerInterval = setInterval(() => {
      const left = this.secondsLeft();
      if (left <= 1) {
        this.onFinish();
      } else {
        this.secondsLeft.set(left - 1);
      }
    }, 1000);
  }

  pause(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    this.isRunning.set(false);
  }

  toggleStart(): void {
    if (this.isRunning()) {
      this.pause();
    } else {
      this.start();
    }
  }

  reset(): void {
    this.pause();
    const cfg = this.config();
    let mins = cfg.focusMinutes;
    if (this.mode() === 'shortBreak') mins = cfg.shortBreakMinutes;
    if (this.mode() === 'longBreak') mins = cfg.longBreakMinutes;
    this.secondsLeft.set(mins * 60);
  }

  skip(): void {
    this.onFinish(true);
  }

  private onFinish(skipped = false): void {
    this.pause();
    this.playChime();

    if (this.mode() === 'focus') {
      const focusMins = this.config().focusMinutes;
      const taskId = this.activeTaskId();

      if (!skipped) {
        this.completedSessions.update((n) => n + 1);

        // Auto-log focus time to the task
        if (taskId) {
          this.store.logTime(taskId, focusMins);
          const task = this.store.byId(taskId);
          this.toast.show(`Focus session complete! Logged ${focusMins}m to "${task?.title ?? 'task'}" 🎉`, { type: 'success' });
        } else {
          this.toast.show(`Focus session complete! Take a break 🎉`, { type: 'success' });
        }
      }

      // 4 focus sessions = long break, otherwise short break
      if (this.completedSessions() % 4 === 0) {
        this.setMode('longBreak');
      } else {
        this.setMode('shortBreak');
      }
    } else {
      if (!skipped) {
        this.toast.show(`Break over! Ready to focus? 💪`, { type: 'info' });
      }
      this.setMode('focus');
    }
  }

  /** Pleasant audio chime using Web Audio API */
  private playChime(): void {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.3); // A5

      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.8);
    } catch {
      // AudioContext unavailable or autoplay blocked
    }
  }
}
