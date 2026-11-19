# TaskFlow – Angular 18 task manager

Daily, weekly and monthly tasks with progress, calendar, reminders and live sync. Installable as an app (PWA) on phone and desktop.

## Run it

```bash
npm install
npm start            # http://localhost:4200
```

## Build and host

```bash
npm run build        # output: dist/taskflow-frontend/browser
```

Upload `dist/taskflow-frontend/browser` to any static host. It is a single-page app, so the host must serve `index.html` for unknown routes:

| Host | How |
|---|---|
| Netlify | Drag the folder in (`_redirects` is already included) |
| Vercel | `vercel --prod`, output directory `dist/taskflow-frontend/browser`, add a rewrite `/(.*)` -> `/index.html` |
| Firebase Hosting | `firebase init hosting`, public dir above, answer **yes** to "single-page app" |
| GitHub Pages / Cloudflare Pages | Publish the folder, enable SPA fallback |

Serve it over HTTPS (all hosts above do): reminders, notifications and "install app" need it.

## What works today

- Tasks: create/edit/delete with undo, priority, category, notes, checklist, daily/weekly/monthly repeat (the next one is created when you finish one)
- Views: list grouped by day, Kanban board (drag and drop), month and week calendar, day agenda
- Progress: daily, weekly and monthly completion charts, streak, per-category breakdown
- Reminders: in-app toast + chime + bell inbox + optional browser notifications (Settings)
- Live sync: every open tab/window updates instantly
- Light/dark theme, accent colors, backup export/import, installable PWA, mobile layout
- Press **N** anywhere to add a task

Data is stored in the browser (`localStorage`) of each device.

## Limits to know

- Reminders fire while the app is open or running in the background of the browser. True push when the app is fully closed needs a backend (Web Push) – that is the next step.
- Sync between different devices needs the backend too. Today sync is between tabs on the same device.

## Connecting a backend later

Only two files talk to storage and the network:

- `src/app/core/services/task.store.ts` – `mutate()` is the single write path: replace the `localStorage` write with an HTTP call (and load from the API in the constructor).
- `src/app/core/services/realtime.service.ts` – keep `emit()` / `on()` and swap `BroadcastChannel` for a Socket.IO/WebSocket connection.

Components do not change.

## Structure

```
src/app/
  core/      models, services (store, stats, reminders, realtime, settings, toast), date utils
  shared/    icon, progress ring, task row, task dialog, toasts
  layout/    shell (sidebar, top bar, mobile nav)
  features/  dashboard, tasks, calendar, progress, settings (lazy loaded)
src/styles/  design tokens (colors, radius, shadows), base, shared components
```
