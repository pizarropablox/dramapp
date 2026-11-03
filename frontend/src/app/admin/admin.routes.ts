import { Routes } from '@angular/router';

/** ⚙️ Administración, under /admin (admin only: see app.routes.ts). Each screen is loaded on demand. */
export const ADMIN_ROUTES: Routes = [
  {
    path: '',
    title: 'Administración · DRAMApp',
    loadComponent: () => import('./admin-page').then((m) => m.AdminPage),
  },
  {
    path: 'carta',
    title: 'Carta · DRAMApp',
    loadComponent: () => import('./menu-page').then((m) => m.MenuPage),
  },
  {
    path: 'carta/nuevo',
    title: 'Agregar producto · DRAMApp',
    loadComponent: () => import('./product-form-page').then((m) => m.ProductFormPage),
  },
  {
    path: 'carta/:id/variante',
    title: 'Agregar variante · DRAMApp',
    loadComponent: () => import('./variant-form-page').then((m) => m.VariantFormPage),
  },
];
