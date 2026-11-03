import { AdminProductResponse } from '../app/admin/admin-product';

/** /api/products/all for the admin specs: products with and without variants, and deactivated ones. */
export const ADMIN_MENU: AdminProductResponse[] = [
  {
    id: 1,
    name: 'Cerveza',
    unitPrice: 3000,
    promoQuantity: 2,
    promoPrice: 5000,
    active: true,
    variants: [
      { id: 11, name: 'Normal', active: true },
      { id: 12, name: '0,0', active: true },
    ],
  },
  {
    id: 9,
    name: 'Jack Daniels',
    unitPrice: 8500,
    promoQuantity: 2,
    promoPrice: 15000,
    active: true,
    variants: [
      { id: 91, name: 'Original', active: true },
      { id: 92, name: 'Manzana', active: true },
      { id: 93, name: 'Honey', active: false },
    ],
  },
  {
    id: 12,
    name: 'Red Bull',
    unitPrice: 3500,
    promoQuantity: null,
    promoPrice: null,
    active: true,
    variants: [{ id: 121, name: 'Única', active: true }],
  },
  {
    id: 14,
    name: 'Piscola',
    unitPrice: 5500,
    promoQuantity: null,
    promoPrice: null,
    active: false,
    variants: [{ id: 141, name: 'Única', active: true }],
  },
];
