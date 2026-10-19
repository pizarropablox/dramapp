import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EventResponse } from '../event/event';
import { ProductResponse } from '../product/product';
import { NO_CONNECTION_MESSAGE } from '../shared/api-error';
import { SaleResponse } from './sale';
import { SalePage } from './sale-page';

const OPEN_EVENT: EventResponse = {
  id: 7,
  name: 'DRAMA Octubre',
  eventDate: '2026-10-31',
  status: 'OPEN',
  openedAt: '2026-10-31T22:00:00Z',
  closedAt: null,
};

const MENU: ProductResponse[] = [
  {
    id: 1,
    name: 'Cerveza',
    unitPrice: 3000,
    promoQuantity: 2,
    promoPrice: 5000,
    variants: [
      { id: 11, name: 'Normal' },
      { id: 12, name: '0,0' },
    ],
  },
  {
    id: 9,
    name: 'Jack Daniels',
    unitPrice: 8500,
    promoQuantity: 2,
    promoPrice: 15000,
    variants: [
      { id: 91, name: 'Original' },
      { id: 92, name: 'Manzana' },
    ],
  },
  {
    id: 12,
    name: 'Red Bull',
    unitPrice: 3500,
    promoQuantity: null,
    promoPrice: null,
    variants: [{ id: 121, name: 'Única' }],
  },
  {
    id: 13,
    name: 'Agua 600cc',
    unitPrice: 3000,
    promoQuantity: 2,
    promoPrice: 5000,
    variants: [{ id: 131, name: 'Única' }],
  },
];

describe('SalePage', () => {
  let httpTesting: HttpTestingController;
  let fixture: ComponentFixture<SalePage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SalePage],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  async function setup(event: EventResponse | null = OPEN_EVENT): Promise<void> {
    fixture = TestBed.createComponent(SalePage);
    TestBed.tick();
    const eventRequest = httpTesting.expectOne('/api/events/current');
    if (event) {
      eventRequest.flush(event);
    } else {
      eventRequest.flush(
        { title: 'Sin evento abierto', status: 404, detail: 'No hay un evento abierto.' },
        { status: 404, statusText: 'Not Found' },
      );
    }
    httpTesting.expectOne('/api/products').flush(MENU);
    await fixture.whenStable();
  }

  function root(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function text(): string {
    return root().textContent ?? '';
  }

  function buttons(scope: ParentNode = root()): HTMLButtonElement[] {
    return Array.from(scope.querySelectorAll('button'));
  }

  function button(label: string): HTMLButtonElement {
    const found = buttons().find((candidate) => candidate.textContent?.trim() === label);
    if (!found) {
      throw new Error(`No button "${label}"`);
    }
    return found;
  }

  function productButton(name: string): HTMLButtonElement {
    const found = buttons(root().querySelector('app-product-grid')!).find(
      (candidate) => candidate.querySelector('.name')?.textContent?.trim() === name,
    );
    if (!found) {
      throw new Error(`No product "${name}"`);
    }
    return found;
  }

  function confirmButton(): HTMLButtonElement {
    return root().querySelector<HTMLButtonElement>('button.confirm')!;
  }

  function cartLabels(): string[] {
    return Array.from(root().querySelectorAll('app-cart-panel .label')).map((label) =>
      (label.textContent ?? '').replace(/\s+/g, ' ').trim(),
    );
  }

  function dialog(): HTMLElement | null {
    return root().querySelector('[role="dialog"]');
  }

  async function tap(element: HTMLElement): Promise<void> {
    element.click();
    await fixture.whenStable();
  }

  async function search(query: string): Promise<void> {
    const input = root().querySelector<HTMLInputElement>('input[type="search"]')!;
    input.value = query;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  describe('event', () => {
    it('shows the open event name', async () => {
      await setup();

      expect(text()).toContain('DRAMA Octubre');
      expect(root().querySelector('[role="alert"]')).toBeNull();
    });

    it('warns and blocks the sale when there is no open event', async () => {
      await setup(null);
      await tap(productButton('Red Bull'));
      await tap(button('Efectivo'));

      expect(root().querySelector('[role="alert"]')?.textContent).toContain('Sin evento abierto');
      expect(confirmButton().disabled).toBe(true);
      expect(text()).toContain('Sin evento abierto: no se puede vender.');
    });
  });

  describe('menu', () => {
    it('shows one button per product in menu order with its price and promo', async () => {
      await setup();

      const names = Array.from(root().querySelectorAll('app-product-grid .name')).map((name) =>
        name.textContent?.trim(),
      );
      expect(names).toEqual(['Cerveza', 'Jack Daniels', 'Red Bull', 'Agua 600cc']);
      expect(productButton('Jack Daniels').textContent).toContain('$8.500');
      expect(productButton('Jack Daniels').textContent).toContain('Promo 2 × $15.000');
      expect(productButton('Red Bull').textContent).not.toContain('Promo');
    });

    it('filters products by name, ignoring case and accents', async () => {
      await setup();

      await search('JACK');
      expect(root().querySelectorAll('app-product-grid .product')).toHaveLength(1);

      await search('agüa');
      expect(productButton('Agua 600cc')).toBeTruthy();

      await search('xyz');
      expect(text()).toContain('Sin productos para “xyz”');
    });
  });

  describe('adding products', () => {
    it('adds a product with a single variant straight to the cart', async () => {
      await setup();

      await tap(productButton('Red Bull'));

      expect(dialog()).toBeNull();
      expect(cartLabels()).toEqual(['Red Bull']);
      expect(confirmButton().closest('app-checkout-bar')?.textContent).toContain('$3.500');
    });

    it('asks for the variant when the product has several, highlighting the first', async () => {
      await setup();

      await tap(productButton('Jack Daniels'));

      const variantButtons = buttons(dialog()!).filter((candidate) =>
        candidate.classList.contains('variant'),
      );
      expect(variantButtons.map((candidate) => candidate.textContent?.trim())).toEqual([
        'Original',
        'Manzana',
      ]);
      expect(variantButtons[0].classList).toContain('primary');
    });

    it('adds the tapped variant and closes the picker', async () => {
      await setup();
      await tap(productButton('Jack Daniels'));

      await tap(button('Manzana'));

      expect(dialog()).toBeNull();
      expect(cartLabels()).toEqual(['Jack Daniels · Manzana']);
    });

    it('cancels the picker without adding anything', async () => {
      await setup();
      await tap(productButton('Jack Daniels'));

      await tap(button('Cancelar'));

      expect(dialog()).toBeNull();
      expect(cartLabels()).toEqual([]);
    });

    it('cancels the picker when tapping outside it', async () => {
      await setup();
      await tap(productButton('Cerveza'));

      await tap(root().querySelector<HTMLElement>('app-variant-picker .backdrop')!);

      expect(dialog()).toBeNull();
      expect(cartLabels()).toEqual([]);
    });
  });

  describe('cart', () => {
    it('is expanded by default once it has products and can be collapsed', async () => {
      await setup();
      const toggle = root().querySelector<HTMLButtonElement>('app-cart-panel .toggle')!;
      expect(toggle.disabled).toBe(true);

      await tap(productButton('Red Bull'));
      expect(toggle.getAttribute('aria-expanded')).toBe('true');
      expect(cartLabels()).toEqual(['Red Bull']);

      await tap(toggle);
      expect(toggle.getAttribute('aria-expanded')).toBe('false');
      expect(cartLabels()).toEqual([]);
    });

    it('changes quantities with + and −, removing the line at 0', async () => {
      await setup();
      await tap(productButton('Red Bull'));

      await tap(root().querySelector<HTMLButtonElement>('[aria-label="Agregar uno de Red Bull"]')!);
      expect(root().querySelector('app-cart-panel .quantity')?.textContent?.trim()).toBe('2');
      expect(text()).toContain('$7.000');

      await tap(root().querySelector<HTMLButtonElement>('[aria-label="Quitar uno de Red Bull"]')!);
      await tap(root().querySelector<HTMLButtonElement>('[aria-label="Quitar uno de Red Bull"]')!);
      expect(cartLabels()).toEqual([]);
    });

    it('empties the cart', async () => {
      await setup();
      await tap(productButton('Red Bull'));
      await tap(productButton('Agua 600cc'));

      await tap(button('Vaciar'));

      expect(text()).toContain('Carrito (0)');
      expect(confirmButton().closest('app-checkout-bar')?.textContent).toContain('$0');
    });

    it('shows the total with promos across variants and the savings', async () => {
      await setup();
      await tap(productButton('Jack Daniels'));
      await tap(button('Original'));
      await tap(productButton('Jack Daniels'));
      await tap(button('Manzana'));

      const checkout = root().querySelector('app-checkout-bar')!.textContent;
      expect(checkout).toContain('$15.000');
      expect(checkout).toContain('Ahorro por promo: $2.000');
    });
  });

  describe('confirming', () => {
    it('cannot confirm without a payment method', async () => {
      await setup();
      await tap(productButton('Red Bull'));

      expect(confirmButton().disabled).toBe(true);
      expect(text()).toContain('Elige el medio de pago.');

      await tap(button('Efectivo'));

      expect(confirmButton().disabled).toBe(false);
      expect(button('Efectivo').getAttribute('aria-pressed')).toBe('true');
    });

    it('cannot confirm an empty cart', async () => {
      await setup();
      await tap(button('Efectivo'));

      expect(confirmButton().disabled).toBe(true);
    });

    it('sends the sale once, shows the backend total and starts a new sale', async () => {
      await setup();
      await tap(productButton('Jack Daniels'));
      await tap(button('Original'));
      await tap(productButton('Red Bull'));
      await tap(button('Mercado Pago'));

      confirmButton().click();
      TestBed.tick();
      confirmButton().click();
      TestBed.tick();

      expect(confirmButton().disabled).toBe(true);
      expect(confirmButton().textContent).toContain('Registrando');
      const request = httpTesting.expectOne('/api/sales');
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual({
        paymentMethod: 'MERCADO_PAGO',
        lines: [
          { variantId: 91, quantity: 1 },
          { variantId: 121, quantity: 1 },
        ],
      });

      // The backend is the authority: show its total even if it differs from the local one.
      const sale: SaleResponse = {
        id: 501,
        eventId: OPEN_EVENT.id,
        paymentMethod: 'MERCADO_PAGO',
        lines: [],
        subtotal: 12345,
        tip: 0,
        total: 12345,
        createdAt: '2026-10-31T23:15:00Z',
      };
      request.flush(sale);
      await fixture.whenStable();

      const confirmation = root().querySelector('[role="alertdialog"]')!;
      expect(confirmation.textContent).toContain('Venta registrada');
      expect(confirmation.textContent).toContain('$12.345');
      expect(confirmation.textContent).toContain('Mercado Pago');
      expect(text()).toContain('Carrito (0)');
      expect(button('Mercado Pago').getAttribute('aria-pressed')).toBe('false');

      await tap(button('Siguiente venta'));

      expect(root().querySelector('[role="alertdialog"]')).toBeNull();
    });

    it('shows the backend detail on error, keeps the cart and rechecks the event on 409', async () => {
      await setup();
      await tap(productButton('Red Bull'));
      await tap(button('Efectivo'));

      confirmButton().click();
      TestBed.tick();
      httpTesting.expectOne('/api/sales').flush(
        {
          title: 'Sin evento abierto',
          status: 409,
          detail: 'No hay un evento abierto. Abre un evento antes de registrar ventas.',
        },
        { status: 409, statusText: 'Conflict' },
      );
      TestBed.tick();
      httpTesting
        .expectOne('/api/events/current')
        .flush({ detail: 'No hay un evento abierto.' }, { status: 404, statusText: 'Not Found' });
      await fixture.whenStable();

      expect(text()).toContain('No hay un evento abierto. Abre un evento antes de registrar ventas.');
      expect(cartLabels()).toEqual(['Red Bull']);
      expect(confirmButton().disabled).toBe(true);
      expect(text()).toContain('Sin evento abierto: no se puede vender.');
    });

    it('shows a generic message without connection and keeps the cart', async () => {
      await setup();
      await tap(productButton('Red Bull'));
      await tap(button('Efectivo'));

      confirmButton().click();
      TestBed.tick();
      httpTesting.expectOne('/api/sales').error(new ProgressEvent('error'));
      await fixture.whenStable();

      expect(text()).toContain(NO_CONNECTION_MESSAGE);
      expect(cartLabels()).toEqual(['Red Bull']);
      expect(confirmButton().disabled).toBe(false);
    });
  });
});
