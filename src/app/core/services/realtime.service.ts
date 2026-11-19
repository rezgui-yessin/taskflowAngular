import { Injectable, OnDestroy, signal } from '@angular/core';

type Handler<T = unknown> = (payload: T) => void;

/**
 * Real-time transport.
 *
 * Today it syncs every open tab/window of the app instantly using BroadcastChannel,
 * so the app already behaves "live" without a backend.
 *
 * When the backend is ready, keep this exact public API (emit / on) and replace the
 * internals with a Socket.IO or WebSocket connection. No other file has to change.
 */
@Injectable({ providedIn: 'root' })
export class RealtimeService implements OnDestroy {
  private readonly channel: BroadcastChannel | null =
    typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('taskflow-sync') : null;
  private readonly handlers = new Map<string, Handler[]>();

  readonly connected = signal(this.channel !== null);

  constructor() {
    this.channel?.addEventListener('message', (e: MessageEvent<{ type: string; payload: unknown }>) => {
      this.handlers.get(e.data.type)?.forEach((h) => h(e.data.payload));
    });
  }

  emit(type: string, payload: unknown): void {
    this.channel?.postMessage({ type, payload });
  }

  on<T>(type: string, handler: Handler<T>): void {
    const list = this.handlers.get(type) ?? [];
    list.push(handler as Handler);
    this.handlers.set(type, list);
  }

  ngOnDestroy(): void {
    this.channel?.close();
  }
}
