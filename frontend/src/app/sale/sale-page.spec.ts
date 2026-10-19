import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { Mock } from 'vitest';
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
  // jsdom does not implement scrollIntoView.
  let scrollIntoView: Mock<(options?: boolean | ScrollIntoViewOptions) => void>;

  beforeEach(async () => {
    scrollIntoView = vi.fn<(options?: boolean | ScrollIntoViewOptions) => void>();
    Element.prototype.scrollIntoView = scrollIntoView;
    await TestBed.configureTestingModule({
      imports: [SalePage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
    delete (Element.prototype as Partial<Element>).scrollIntoView;
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

  function saleResponse(amounts: Pick<SaleResponse, 'subtotal' | 'tipAmount' | 'amountToCharge'>): SaleResponse {
    return {
      id: 501,
      eventId: OPEN_EVENT.id,
      paymentMethod: 'MERCADO_PAGO',
      lines: [],
      createdAt: '2026-10-31T23:15:00Z',
      status: 'ACTIVE',
      voidedAt: null,
      voidReason: null,
      ...amounts,
    };
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

    it('scrolls to the line just added, also when it was already in the cart', async () => {
      await setup();
      await tap(productButton('Red Bull'));
      await tap(productButton('Agua 600cc'));

      const scrolledLabel = () =>
        (scrollIntoView.mock.contexts.at(-1) as HTMLElement).querySelector('.label')?.textContent?.trim();
      expect(scrolledLabel()).toBe('Agua 600cc');

      await tap(productButton('Red Bull'));

      expect(scrolledLabel()).toBe('Red Bull');
      expect(scrollIntoView).toHaveBeenLastCalledWith({ block: 'nearest', behavior: 'smooth' });
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
        tipAmount: 0,
      });

      // The backend is the authority: show its total even if it differs from the local one.
      request.flush(saleResponse({ subtotal: 12345, tipAmount: 0, amountToCharge: 12345 }));
      await fixture.whenStable();

      const confirmation = root().querySelector('[role="alertdialog"]')!;
      expect(confirmation.textContent).toContain('Venta registrada');
      expect(confirmation.textContent).toContain('$12.345');
      expect(confirmation.textContent).toContain('Mercado Pago');
      expect(confirmation.textContent).not.toContain('propina');
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

  describe('tip', () => {
    function customTip(): HTMLInputElement {
      return root().querySelector<HTMLInputElement>('app-tip-selector input')!;
    }

    async function typeCustomTip(value: string): Promise<void> {
      const input = customTip();
      input.dispatchEvent(new Event('focus'));
      input.value = value;
      input.dispatchEvent(new Event('input'));
      await fixture.whenStable();
    }

    function checkout(): string {
      return root().querySelector('app-checkout-bar')!.textContent ?? '';
    }

    it('starts with "Sin propina" and charges only the products', async () => {
      await setup();
      await tap(productButton('Red Bull'));

      expect(button('Sin propina').getAttribute('aria-pressed')).toBe('true');
      expect(customTip().value).toBe('');
      expect(checkout()).toContain('$3.500');
      expect(checkout()).not.toContain('propina');
    });

    it('adds a quick tip to the amount to charge and shows the breakdown', async () => {
      await setup();
      await tap(productButton('Red Bull'));

      await tap(button('$1.000'));

      expect(button('$1.000').getAttribute('aria-pressed')).toBe('true');
      expect(button('Sin propina').getAttribute('aria-pressed')).toBe('false');
      expect(root().querySelector('app-checkout-bar .amount')?.textContent).toContain('$4.500');
      expect(checkout()).toContain('Productos $3.500 + propina $1.000');
    });

    it('accepts a custom amount, keeping only digits', async () => {
      await setup();
      await tap(productButton('Red Bull'));
      await tap(button('$500'));

      await typeCustomTip('1.5a00');

      expect(customTip().value).toBe('1500');
      expect(customTip().classList).toContain('selected');
      expect(button('$500').getAttribute('aria-pressed')).toBe('false');
      expect(root().querySelector('app-checkout-bar .amount')?.textContent).toContain('$5.000');
      expect(checkout()).toContain('Productos $3.500 + propina $1.500');
    });

    it('goes back to "Sin propina" from a custom amount', async () => {
      await setup();
      await tap(productButton('Red Bull'));
      await typeCustomTip('700');

      await tap(button('Sin propina'));

      expect(button('Sin propina').getAttribute('aria-pressed')).toBe('true');
      expect(customTip().value).toBe('');
      expect(checkout()).not.toContain('propina');
    });

    it('returns to "Sin propina" when "Otro" is left empty', async () => {
      await setup();
      await tap(productButton('Red Bull'));
      await typeCustomTip('');

      customTip().dispatchEvent(new Event('blur'));
      await fixture.whenStable();

      expect(button('Sin propina').getAttribute('aria-pressed')).toBe('true');
    });

    it('allows a tip greater than the products total', async () => {
      await setup();
      await tap(productButton('Agua 600cc'));
      await tap(button('Efectivo'));

      await typeCustomTip('5000');

      expect(confirmButton().disabled).toBe(false);
      expect(root().querySelector('app-checkout-bar .amount')?.textContent).toContain('$8.000');
    });

    it('blocks the sale when the tip goes over $10.000', async () => {
      await setup();
      await tap(productButton('Red Bull'));
      await tap(button('Efectivo'));

      await typeCustomTip('10001');

      expect(confirmButton().disabled).toBe(true);
      expect(text()).toContain('La propina no puede superar $10.000.');
      expect(customTip().getAttribute('aria-invalid')).toBe('true');

      await typeCustomTip('10000');

      expect(confirmButton().disabled).toBe(false);
    });

    it('sends tipAmount, shows the backend breakdown and resets the tip after the sale', async () => {
      await setup();
      await tap(productButton('Red Bull'));
      await tap(button('$2.000'));
      await tap(button('Mercado Pago'));

      await tap(confirmButton());
      const request = httpTesting.expectOne('/api/sales');
      expect(request.request.body).toEqual({
        paymentMethod: 'MERCADO_PAGO',
        lines: [{ variantId: 121, quantity: 1 }],
        tipAmount: 2000,
      });
      request.flush(saleResponse({ subtotal: 3500, tipAmount: 2000, amountToCharge: 5500 }));
      await fixture.whenStable();

      const confirmation = root().querySelector('[role="alertdialog"]')!.textContent;
      expect(confirmation).toContain('Cobrar');
      expect(confirmation).toContain('$5.500');
      expect(confirmation).toContain('Productos $3.500 + propina $2.000');
      expect(button('Sin propina').getAttribute('aria-pressed')).toBe('true');
      expect(button('$2.000').getAttribute('aria-pressed')).toBe('false');
    });

    it('resets a custom tip after the sale', async () => {
      await setup();
      await tap(productButton('Red Bull'));
      await typeCustomTip('1200');
      await tap(button('Efectivo'));

      await tap(confirmButton());
      const request = httpTesting.expectOne('/api/sales');
      expect(request.request.body.tipAmount).toBe(1200);
      request.flush(saleResponse({ subtotal: 3500, tipAmount: 1200, amountToCharge: 4700 }));
      await fixture.whenStable();

      expect(customTip().value).toBe('');
      expect(customTip().classList).not.toContain('selected');
      expect(button('Sin propina').getAttribute('aria-pressed')).toBe('true');
    });

    it('keeps the tip when the sale fails', async () => {
      await setup();
      await tap(productButton('Red Bull'));
      await tap(button('$500'));
      await tap(button('Efectivo'));

      await tap(confirmButton());
      httpTesting.expectOne('/api/sales').error(new ProgressEvent('error'));
      await fixture.whenStable();

      expect(button('$500').getAttribute('aria-pressed')).toBe('true');
    });
  });

  describe('voiding', () => {
    const CASH_SALE: SaleResponse = {
      id: 501,
      eventId: OPEN_EVENT.id,
      paymentMethod: 'EFECTIVO',
      lines: [
        { variantId: 91, variantName: 'Original', productId: 9, productName: 'Jack Daniels', quantity: 1 },
        { variantId: 121, variantName: 'Única', productId: 12, productName: 'Red Bull', quantity: 1 },
      ],
      subtotal: 7000,
      tipAmount: 1000,
      amountToCharge: 8000,
      createdAt: '2026-10-31T23:15:00Z',
      status: 'ACTIVE',
      voidedAt: null,
      voidReason: null,
    };

    function voided(sale: SaleResponse, reason: string | null = null): SaleResponse {
      return { ...sale, status: 'VOIDED', voidedAt: '2026-10-31T23:18:00Z', voidReason: reason };
    }

    /** Registers a sale and leaves the "Venta registrada" confirmation open with the backend's answer. */
    async function registerSale(sale: SaleResponse = CASH_SALE): Promise<void> {
      await setup();
      await tap(productButton('Red Bull'));
      await tap(button(sale.paymentMethod === 'EFECTIVO' ? 'Efectivo' : 'Mercado Pago'));
      confirmButton().click();
      TestBed.tick();
      httpTesting.expectOne('/api/sales').flush(sale);
      await fixture.whenStable();
    }

    function confirmation(): HTMLElement | null {
      return root().querySelector('app-sale-confirmation [role="alertdialog"]');
    }

    function voidDialog(): HTMLElement | null {
      return root().querySelector('app-void-sale-dialog [role="alertdialog"]');
    }

    function sheet(): HTMLElement | null {
      return root().querySelector('app-recent-sales-sheet [role="dialog"]');
    }

    function toast(): HTMLElement | null {
      return root().querySelector('.toast');
    }

    async function typeReason(reason: string): Promise<void> {
      const input = voidDialog()!.querySelector<HTMLInputElement>('input')!;
      input.value = reason;
      input.dispatchEvent(new Event('input'));
      await fixture.whenStable();
    }

    async function confirmVoid(): Promise<void> {
      button('Anular venta').click();
      TestBed.tick();
    }

    async function openRecent(sales: SaleResponse[]): Promise<void> {
      // Not tap(): whenStable() would wait for the request this test has to answer.
      button('Ventas').click();
      TestBed.tick();
      httpTesting.expectOne('/api/sales').flush(sales);
      await fixture.whenStable();
    }

    function rows(): HTMLElement[] {
      return Array.from(sheet()!.querySelectorAll<HTMLElement>('li.sale'));
    }

    describe('from the confirmation', () => {
      it('offers a secondary "Anular esta venta" below "Siguiente venta"', async () => {
        await registerSale();

        const actions = buttons(confirmation()!).map((candidate) => candidate.textContent?.trim());
        expect(actions).toEqual(['Siguiente venta', 'Anular esta venta']);
        expect(document.activeElement?.textContent?.trim()).toBe('Siguiente venta');
        expect(button('Anular esta venta').classList).toContain('void');
      });

      it('asks to confirm with the amount charged, tip included, and the cash reminder', async () => {
        await registerSale();

        await tap(button('Anular esta venta'));

        expect(voidDialog()!.querySelector('h2')?.textContent).toBe('¿Anular venta de $8.000 (Efectivo)?');
        expect(voidDialog()!.textContent).toContain('20:15 · 1× Jack Daniels Original · 1× Red Bull');
        expect(voidDialog()!.textContent).toContain('Devuelve el efectivo de la caja.');
        expect(voidDialog()!.textContent).not.toContain('Mercado Pago');
        expect(document.activeElement?.textContent?.trim()).toBe('Volver');
      });

      it('reminds to refund in the Mercado Pago app for Mercado Pago sales', async () => {
        await registerSale({ ...CASH_SALE, paymentMethod: 'MERCADO_PAGO' });

        await tap(button('Anular esta venta'));

        expect(voidDialog()!.querySelector('h2')?.textContent).toBe('¿Anular venta de $8.000 (Mercado Pago)?');
        expect(voidDialog()!.textContent).toContain('Recuerda hacer la devolución en la app de Mercado Pago.');
        expect(voidDialog()!.textContent).not.toContain('Devuelve el efectivo');
      });

      it('goes back without voiding', async () => {
        await registerSale();
        await tap(button('Anular esta venta'));

        await tap(button('Volver'));

        expect(voidDialog()).toBeNull();
        expect(confirmation()).not.toBeNull();
        httpTesting.expectNone('/api/sales/501/void');
      });

      it('sends the reason once, closes the confirmation and confirms the void', async () => {
        await registerSale();
        await tap(button('Anular esta venta'));
        await typeReason('  monto mal digitado ');

        const voidButton = button('Anular venta');
        voidButton.click();
        TestBed.tick();
        voidButton.click();
        TestBed.tick();

        expect(voidButton.textContent?.trim()).toBe('Anulando…');
        expect(voidButton.disabled).toBe(true);
        expect(button('Volver').disabled).toBe(true);
        const request = httpTesting.expectOne('/api/sales/501/void');
        expect(request.request.method).toBe('POST');
        expect(request.request.body).toEqual({ reason: 'monto mal digitado' });
        request.flush(voided(CASH_SALE, 'monto mal digitado'));
        await fixture.whenStable();

        expect(voidDialog()).toBeNull();
        expect(confirmation()).toBeNull();
        expect(toast()?.getAttribute('role')).toBe('status');
        expect(toast()?.textContent).toContain('Venta anulada. Devuelve $8.000 en efectivo de la caja.');

        await tap(toast()!.querySelector<HTMLButtonElement>('button[aria-label="Cerrar aviso"]')!);
        expect(toast()).toBeNull();
      });

      it('sends a null reason when it is left empty', async () => {
        await registerSale();
        await tap(button('Anular esta venta'));
        await typeReason('   ');

        await confirmVoid();

        const request = httpTesting.expectOne('/api/sales/501/void');
        expect(request.request.body).toEqual({ reason: null });
        request.flush(voided(CASH_SALE));
        await fixture.whenStable();
      });

      it('caps the reason at 100 characters', async () => {
        await registerSale();
        await tap(button('Anular esta venta'));

        expect(voidDialog()!.querySelector('input')?.getAttribute('maxlength')).toBe('100');
      });

      it('shows the backend detail on 409, keeps the dialog open and rechecks the event', async () => {
        await registerSale();
        await tap(button('Anular esta venta'));

        await confirmVoid();
        httpTesting.expectOne('/api/sales/501/void').flush(
          {
            title: 'Evento cerrado',
            status: 409,
            detail: 'El evento DRAMA Octubre ya está cerrado: no se pueden anular sus ventas.',
          },
          { status: 409, statusText: 'Conflict' },
        );
        TestBed.tick();
        httpTesting.expectOne('/api/events/current').flush(OPEN_EVENT);
        await fixture.whenStable();

        expect(voidDialog()!.querySelector('[role="alert"]')?.textContent).toBe(
          'El evento DRAMA Octubre ya está cerrado: no se pueden anular sus ventas.',
        );
        expect(button('Anular venta').disabled).toBe(false);
        expect(toast()).toBeNull();
      });

      it('shows the backend detail on 404', async () => {
        await registerSale();
        await tap(button('Anular esta venta'));

        await confirmVoid();
        httpTesting
          .expectOne('/api/sales/501/void')
          .flush(
            { title: 'Venta no encontrada', status: 404, detail: 'La venta 501 no existe.' },
            { status: 404, statusText: 'Not Found' },
          );
        await fixture.whenStable();

        expect(voidDialog()!.querySelector('[role="alert"]')?.textContent).toBe('La venta 501 no existe.');
      });

      it('shows a generic message without connection', async () => {
        await registerSale();
        await tap(button('Anular esta venta'));

        await confirmVoid();
        httpTesting.expectOne('/api/sales/501/void').error(new ProgressEvent('error'));
        await fixture.whenStable();

        expect(voidDialog()!.textContent).toContain(NO_CONNECTION_MESSAGE);
      });
    });

    describe('from the latest sales', () => {
      const MP_SALE: SaleResponse = {
        ...CASH_SALE,
        id: 502,
        paymentMethod: 'MERCADO_PAGO',
        lines: [{ variantId: 11, variantName: 'Normal', productId: 1, productName: 'Cerveza', quantity: 2 }],
        subtotal: 5000,
        tipAmount: 0,
        amountToCharge: 5000,
        createdAt: '2026-10-31T23:40:00Z',
      };
      const VOIDED_SALE = voided({ ...CASH_SALE, id: 500, createdAt: '2026-10-31T23:05:00Z' }, 'monto mal digitado');

      it('opens from the header without touching the cart', async () => {
        await setup();
        await tap(productButton('Red Bull'));

        await openRecent([]);

        expect(sheet()!.textContent).toContain('Últimas ventas');
        expect(sheet()!.textContent).toContain('Aún no hay ventas en este evento.');
        await tap(button('Cerrar'));
        expect(sheet()).toBeNull();
        expect(cartLabels()).toEqual(['Red Bull']);
      });

      it('lists time, products, amount and payment method, with the voided ones marked', async () => {
        await setup();

        await openRecent([MP_SALE, CASH_SALE, VOIDED_SALE]);

        const [mp, cash, voidedRow] = rows();
        expect(mp.textContent).toContain('20:40');
        expect(mp.textContent).toContain('Mercado Pago');
        expect(mp.textContent).toContain('2× Cerveza Normal');
        expect(mp.textContent).toContain('$5.000');
        expect(mp.classList).not.toContain('voided');
        expect(mp.querySelector('button.void')).not.toBeNull();

        expect(cash.textContent).toContain('Efectivo');
        expect(cash.textContent).toContain('$8.000');

        expect(voidedRow.classList).toContain('voided');
        expect(voidedRow.querySelector('.badge')?.textContent).toBe('Anulada 20:18');
        expect(voidedRow.textContent).toContain('Motivo: monto mal digitado');
        expect(voidedRow.querySelector('button.void')).toBeNull();
      });

      it('voids from the list and shows the row voided', async () => {
        await setup();
        await openRecent([MP_SALE, CASH_SALE]);

        await tap(rows()[0].querySelector<HTMLButtonElement>('button.void')!);
        expect(voidDialog()!.querySelector('h2')?.textContent).toBe('¿Anular venta de $5.000 (Mercado Pago)?');
        await typeReason('cliente se arrepintió');
        await confirmVoid();
        const request = httpTesting.expectOne('/api/sales/502/void');
        expect(request.request.body).toEqual({ reason: 'cliente se arrepintió' });
        request.flush(voided(MP_SALE, 'cliente se arrepintió'));
        await fixture.whenStable();

        expect(voidDialog()).toBeNull();
        expect(sheet()).not.toBeNull();
        expect(rows()[0].classList).toContain('voided');
        expect(rows()[0].textContent).toContain('Motivo: cliente se arrepintió');
        expect(rows()[0].querySelector('button.void')).toBeNull();
        expect(rows()[1].classList).not.toContain('voided');
        expect(toast()?.textContent).toContain('Venta anulada. Devuelve $5.000 en la app de Mercado Pago.');
      });

      it('reloads the list on 409, as another phone may have voided the sale', async () => {
        await setup();
        await openRecent([CASH_SALE]);
        await tap(rows()[0].querySelector<HTMLButtonElement>('button.void')!);

        await confirmVoid();
        httpTesting.expectOne('/api/sales/501/void').flush(
          { title: 'Venta ya anulada', status: 409, detail: 'La venta 501 ya está anulada (a las 20:18).' },
          { status: 409, statusText: 'Conflict' },
        );
        TestBed.tick();
        httpTesting.expectOne('/api/sales').flush([voided(CASH_SALE)]);
        httpTesting.expectOne('/api/events/current').flush(OPEN_EVENT);
        await fixture.whenStable();

        expect(voidDialog()!.querySelector('[role="alert"]')?.textContent).toBe(
          'La venta 501 ya está anulada (a las 20:18).',
        );
        await tap(button('Volver'));
        expect(rows()[0].classList).toContain('voided');
      });

      it('closes only the void dialog on Escape', async () => {
        await setup();
        await openRecent([CASH_SALE]);
        await tap(rows()[0].querySelector<HTMLButtonElement>('button.void')!);

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        await fixture.whenStable();

        expect(voidDialog()).toBeNull();
        expect(sheet()).not.toBeNull();
      });

      it('loads the list again every time it is opened', async () => {
        await setup();
        await openRecent([]);
        await tap(button('Cerrar'));

        await openRecent([CASH_SALE]);

        expect(rows()).toHaveLength(1);
      });

      it('links to the totals', async () => {
        await setup();

        await openRecent([]);

        const link = sheet()!.querySelector<HTMLAnchorElement>('a.totals')!;
        expect(link.textContent?.trim()).toBe('Ver totales →');
        expect(link.getAttribute('href')).toBe('/totales');
      });

      it('keeps the cart when the sale screen is left and opened again', async () => {
        await setup();
        await tap(productButton('Red Bull'));
        await tap(button('Efectivo'));

        fixture.destroy();
        await setup();

        expect(cartLabels()).toEqual(['Red Bull']);
        // Only the cart survives: payment method and tip start over.
        expect(button('Efectivo').getAttribute('aria-pressed')).toBe('false');
        expect(button('Sin propina').getAttribute('aria-pressed')).toBe('true');
      });

      it('says so when there is no open event', async () => {
        await setup(null);

        await openRecent([]);

        expect(sheet()!.textContent).toContain('No hay un evento abierto.');
      });

      it('shows the backend detail when the list fails and retries', async () => {
        await setup();
        button('Ventas').click();
        TestBed.tick();
        httpTesting
          .expectOne('/api/sales')
          .flush({ status: 500, detail: 'Error interno.' }, { status: 500, statusText: 'Server Error' });
        await fixture.whenStable();

        expect(sheet()!.querySelector('[role="alert"]')?.textContent).toContain('Error interno.');
        button('Reintentar').click();
        TestBed.tick();
        httpTesting.expectOne('/api/sales').flush([CASH_SALE]);
        await fixture.whenStable();
        expect(rows()).toHaveLength(1);
      });
    });
  });
});
