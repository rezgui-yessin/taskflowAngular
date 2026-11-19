import { Injectable, signal } from '@angular/core';

export type ToastType = 'success' | 'info' | 'warning' | 'error';

export interface Toast {
  id: number;
  message: string;
  title?: string;
  type: ToastType;
  actionLabel?: string;
  action?: () => void;
}

export interface ToastOptions {
  title?: string;
  type?: ToastType;
  duration?: number;
  actionLabel?: string;
  action?: () => void;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private seq = 0;
  private readonly _toasts = signal<Toast[]>([]);
  readonly toasts = this._toasts.asReadonly();

  show(message: string, opts: ToastOptions = {}): void {
    const toast: Toast = {
      id: ++this.seq,
      message,
      title: opts.title,
      type: opts.type ?? 'success',
      actionLabel: opts.actionLabel,
      action: opts.action,
    };
    this._toasts.update((list) => [...list, toast].slice(-4));
    setTimeout(() => this.dismiss(toast.id), opts.duration ?? (opts.action ? 6500 : 3800));
  }

  dismiss(id: number): void {
    this._toasts.update((list) => list.filter((t) => t.id !== id));
  }
}
