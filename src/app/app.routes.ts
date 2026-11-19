import { Routes } from '@angular/router';
import { ShellComponent } from './layout/shell/shell.component';

export const routes: Routes = [
  {
    path: '',
    component: ShellComponent,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        title: 'Dashboard · TaskFlow',
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
      },
      {
        path: 'tasks',
        title: 'Tasks · TaskFlow',
        loadComponent: () => import('./features/tasks/tasks.component').then((m) => m.TasksComponent),
      },
      {
        path: 'habits',
        title: 'Habits · TaskFlow',
        loadComponent: () => import('./features/habits/habits.component').then((m) => m.HabitsComponent),
      },
      {
        path: 'calendar',
        title: 'Calendar · TaskFlow',
        loadComponent: () =>
          import('./features/calendar/calendar.component').then((m) => m.CalendarComponent),
      },
      {
        path: 'progress',
        title: 'Progress · TaskFlow',
        loadComponent: () =>
          import('./features/progress/progress.component').then((m) => m.ProgressComponent),
      },
      {
        path: 'settings',
        title: 'Settings · TaskFlow',
        loadComponent: () =>
          import('./features/settings/settings.component').then((m) => m.SettingsComponent),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
