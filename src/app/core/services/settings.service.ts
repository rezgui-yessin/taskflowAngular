import { Injectable, computed, effect, signal } from '@angular/core';

export type ThemeMode = 'light' | 'dark' | 'system';

export interface AppSettings {
  theme: ThemeMode;
  accent: string;
  sound: boolean;
  browserNotify: boolean;
}

export const ACCENTS: { name: string; value: string }[] = [
  { name: 'Indigo', value: '#6366f1' },
  { name: 'Violet', value: '#8b5cf6' },
  { name: 'Sky', value: '#0ea5e9' },
  { name: 'Emerald', value: '#10b981' },
  { name: 'Amber', value: '#f59e0b' },
  { name: 'Rose', value: '#f43f5e' },
];

const KEY = 'taskflow.settings.v1';
const DEFAULTS: AppSettings = { theme: 'system', accent: '#6366f1', sound: true, browserNotify: false };

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly _settings = signal<AppSettings>(this.load());
  private readonly systemDark = signal(false);

  readonly settings = this._settings.asReadonly();
  readonly resolvedTheme = computed<'light' | 'dark'>(() => {
    const t = this._settings().theme;
    return t === 'system' ? (this.systemDark() ? 'dark' : 'light') : t;
  });

  constructor() {
    if (typeof matchMedia !== 'undefined') {
      const mq = matchMedia('(prefers-color-scheme: dark)');
      this.systemDark.set(mq.matches);
      mq.addEventListener('change', (e) => this.systemDark.set(e.matches));
    }

    effect(() => {
      const theme = this.resolvedTheme();
      const { accent } = this._settings();
      const root = document.documentElement;
      root.dataset['theme'] = theme;
      root.style.setProperty('--accent', accent);
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', accent);
    });
  }

  patch(partial: Partial<AppSettings>): void {
    const next = { ...this._settings(), ...partial };
    this._settings.set(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable: keep in memory only */
    }
  }

  toggleTheme(): void {
    this.patch({ theme: this.resolvedTheme() === 'dark' ? 'light' : 'dark' });
  }

  private load(): AppSettings {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
    } catch {
      return { ...DEFAULTS };
    }
  }
}
