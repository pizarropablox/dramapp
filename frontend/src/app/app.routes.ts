import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    title: 'Venta · DRAMApp',
    loadComponent: () => import('./sale/sale-page').then((m) => m.SalePage),
  },
  {
    path: 'estado',
    title: 'Estado del sistema · DRAMApp',
    loadComponent: () => import('./system/system-status-page').then((m) => m.SystemStatusPage),
  },
  { path: '**', redirectTo: '' },
];
