import { Routes } from '@angular/router';
import { adminGuard, authGuard, guestGuard } from './auth/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    title: 'Iniciar sesión · DRAMApp',
    canActivate: [guestGuard],
    loadComponent: () => import('./auth/login-page').then((m) => m.LoginPage),
  },
  {
    path: '',
    title: 'Venta · DRAMApp',
    canActivate: [authGuard],
    loadComponent: () => import('./sale/sale-page').then((m) => m.SalePage),
  },
  {
    path: 'totales',
    title: 'Totales · DRAMApp',
    canActivate: [authGuard],
    loadComponent: () => import('./summary/totals-page').then((m) => m.TotalsPage),
  },
  {
    path: 'estado',
    title: 'Estado del sistema · DRAMApp',
    canActivate: [adminGuard],
    loadComponent: () => import('./system/system-status-page').then((m) => m.SystemStatusPage),
  },
  { path: '**', redirectTo: '' },
];
