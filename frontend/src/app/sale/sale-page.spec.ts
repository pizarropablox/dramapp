import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  TestRequest,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { Mock } from 'vitest';
import { AuthStore } from '../auth/auth-store';
import {
  POLL_WITH_EVENT_MS,
  POLL_WITHOUT_EVENT_MS,
  STOP_WITHOUT_EVENT_MS,
} from '../event/current-event-store';
import { EventResponse } from '../event/event';
import { RefundResponse } from '../refund/refund';
import { ProductResponse } from '../product/product';
import { NO_CONNECTION_MESSAGE } from '../shared/api-error';
import { MemoryStorage } from '../../testing/memory-storage';
import { CART_STORAGE, CART_STORAGE_KEY } from './cart-storage';
import { SaleResponse } from './sale';
import { SALE_REQUEST_TIMEOUT_MS } from './sale.service';
import { EVENT_CLOSED_MESSAGE, RESTORED_NOTICE_MS, SalePage, UNDO_EMPTY_MS } from './sale-page';

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
  /** The phone's localStorage: survives reload() below. */
  let storage: MemoryStorage;

  async function configure(): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [SalePage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: CART_STORAGE, useValue: storage },
      ],
    }).compileComponents();
    httpTesting = TestBed.inject(HttpTestingController);
  }

  beforeEach(async () => {
    scrollIntoView = vi.fn<(options?: boolean | ScrollIntoViewOptions) => void>();
    Element.prototype.scrollIntoView = scrollIntoView;
    storage = new MemoryStorage();
    await configure();
  });

  afterEach(() => {
    httpTesting.verify();
    delete (Element.prototype as Partial<Element>).scrollIntoView;
  });

  async function setup(
    event: EventResponse | null = OPEN_EVENT,
    menu: ProductResponse[] = MENU,
  ): Promise<void> {
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
    httpTesting.expectOne('/api/products').flush(menu);
    await fixture.whenStable();
  }

  function signIn(username = 'barra'): void {
    TestBed.inject(AuthStore).signedIn({
      username,
      role: 'BARRA',
      expiresAt: new Date(Date.now() + 20 * 60 * 60 * 1000).toISOString(),
    });
  }

  /**
   * Reloads the page: a new app (empty CartStore) with the same localStorage, signed in again.
   * A sale still being sent is cut off, as the browser does.
   */
  async function reload(
    event: EventResponse | null = OPEN_EVENT,
    menu: ProductResponse[] = MENU,
  ): Promise<void> {
    fixture.destroy();
    httpTesting.match(() => true);
    httpTesting.verify();
    TestBed.resetTestingModule();
    await configure();
    signIn();
    await setup(event, menu);
  }

  function saved(): Record<string, unknown> | null {
    return storage.json(CART_STORAGE_KEY) as Record<string, unknown> | null;
  }

  function toast(): HTMLElement | null {
    return root().querySelector('.toast');
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

  function saleResponse(
    amounts: Pick<SaleResponse, 'subtotal' | 'tipAmount' | 'amountToCharge'>,
  ): SaleResponse {
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

    it('opened offline (from the service worker cache), says so and does not pretend to sell', async () => {
      fixture = TestBed.createComponent(SalePage);
      TestBed.tick();
      httpTesting.expectOne('/api/events/current').error(new ProgressEvent('error'));
      httpTesting.expectOne('/api/products').error(new ProgressEvent('error'));
      await fixture.whenStable();

      expect(text()).toContain('No se pudo cargar el evento.');
      expect(text()).toContain(`No se pudo cargar la carta. ${NO_CONNECTION_MESSAGE}`);
      expect(root().querySelector('app-product-grid')).toBeNull();
      expect(confirmButton().disabled).toBe(true);
    });
  });

  describe('when admin opens or closes the event from another phone', () => {
    beforeEach(() => vi.useFakeTimers());

    afterEach(() => {
      fixture.destroy();
      vi.useRealTimers();
    });

    /** Like setup(), with fake timers: renders with TestBed.tick() instead of whenStable(). */
    function start(event: EventResponse | null): void {
      fixture = TestBed.createComponent(SalePage);
      TestBed.tick();
      answerEvent(event);
      httpTesting.expectOne('/api/products').flush(MENU);
      TestBed.tick();
    }

    function answerEvent(event: EventResponse | null): void {
      const request = httpTesting.expectOne('/api/events/current');
      if (event) {
        request.flush(event);
      } else {
        request.flush(
          { title: 'Sin evento abierto', status: 404, detail: 'No hay un evento abierto.' },
          { status: 404, statusText: 'Not Found' },
        );
      }
      TestBed.tick();
    }

    function advance(ms: number): void {
      vi.advanceTimersByTime(ms);
      TestBed.tick();
    }

    it('switches to the open event on its own, within 15 s', () => {
      start(null);
      expect(text()).toContain('Sin evento abierto');

      advance(POLL_WITHOUT_EVENT_MS);
      answerEvent(OPEN_EVENT);

      expect(root().querySelector('.event-name')?.textContent).toBe('DRAMA Octubre');
      expect(text()).not.toContain('Sin evento abierto');
    });

    it('notices within a minute that the event was closed, and blocks the sale', () => {
      start(OPEN_EVENT);

      advance(POLL_WITH_EVENT_MS);
      answerEvent(null);

      expect(text()).toContain('Sin evento abierto');
      expect(text()).toContain('Sin evento abierto: no se puede vender.');
    });

    it('stops checking after 30 minutes without an event, and ↻ checks again', () => {
      start(null);
      for (let elapsed = 0; elapsed < STOP_WITHOUT_EVENT_MS; elapsed += POLL_WITHOUT_EVENT_MS) {
        advance(POLL_WITHOUT_EVENT_MS);
        answerEvent(null);
      }

      expect(text()).toContain('Toca ↻ para actualizar');
      advance(STOP_WITHOUT_EVENT_MS);
      httpTesting.expectNone('/api/events/current');

      root().querySelector<HTMLButtonElement>('button[aria-label="Actualizar"]')!.click();
      TestBed.tick();
      answerEvent(OPEN_EVENT);

      expect(root().querySelector('.event-name')?.textContent).toBe('DRAMA Octubre');
      expect(text()).not.toContain('Toca ↻ para actualizar');
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
        (scrollIntoView.mock.contexts.at(-1) as HTMLElement)
          .querySelector('.label')
          ?.textContent?.trim();
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

      expect(text()).toMatch(/Carrito vaciado\s*·\s*Deshacer/);
      expect(cartLabels()).toEqual([]);
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

    it('says the event was closed on 409, keeps the cart and rechecks the event', async () => {
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

      // Not the backend's "Abre un evento…": barra cannot open one.
      expect(text()).toContain(EVENT_CLOSED_MESSAGE);
      expect(cartLabels()).toEqual(['Red Bull']);
      expect(confirmButton().disabled).toBe(true);
      expect(text()).toContain('Sin evento abierto: no se puede vender.');
    });

    it('without an answer, keeps the cart and asks to check whether it was registered', async () => {
      await setup();
      await tap(productButton('Red Bull'));
      await tap(button('Efectivo'));

      confirmButton().click();
      TestBed.tick();
      httpTesting.expectOne('/api/sales').error(new ProgressEvent('error'));
      await fixture.whenStable();

      expect(root().querySelector('app-pending-sale-notice')?.textContent).toContain(
        'Esta venta pudo haberse registrado',
      );
      expect(cartLabels()).toEqual(['Red Bull']);
      expect(confirmButton().disabled).toBe(true);
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
      httpTesting
        .expectOne('/api/sales')
        .flush(
          { status: 400, detail: 'Venta inválida.' },
          { status: 400, statusText: 'Bad Request' },
        );
      await fixture.whenStable();

      expect(text()).toContain('Venta inválida.');
      expect(button('$500').getAttribute('aria-pressed')).toBe('true');
    });
  });

  describe('voiding', () => {
    const CASH_SALE: SaleResponse = {
      id: 501,
      eventId: OPEN_EVENT.id,
      paymentMethod: 'EFECTIVO',
      lines: [
        {
          variantId: 91,
          variantName: 'Original',
          productId: 9,
          productName: 'Jack Daniels',
          quantity: 1,
        },
        {
          variantId: 121,
          variantName: 'Única',
          productId: 12,
          productName: 'Red Bull',
          quantity: 1,
        },
      ],
      subtotal: 7000,
      tipAmount: 1000,
      amountToCharge: 8000,
      createdAt: '2026-10-31T23:15:00Z',
      status: 'ACTIVE',
      voidedAt: null,
      voidReason: null,
    };

    const REFUND: RefundResponse = {
      id: 7,
      eventId: OPEN_EVENT.id,
      amount: 15000,
      reason: 'se acabó el Jack',
      status: 'ACTIVE',
      createdAt: '2026-10-31T23:30:00Z',
      voidedAt: null,
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

    async function openRecent(
      sales: SaleResponse[],
      refunds: RefundResponse[] = [],
    ): Promise<void> {
      // Not tap(): whenStable() would wait for the requests this test has to answer.
      button('Ventas').click();
      TestBed.tick();
      httpTesting.expectOne('/api/sales').flush(sales);
      httpTesting.expectOne('/api/refunds').flush(refunds);
      await fixture.whenStable();
    }

    function rows(): HTMLElement[] {
      return Array.from(sheet()!.querySelectorAll<HTMLElement>('li.sale'));
    }

    /** Sales and refunds, in the order shown. */
    function entries(): HTMLElement[] {
      return Array.from(sheet()!.querySelectorAll<HTMLElement>('li.sale, li.refund'));
    }

    describe('from the confirmation', () => {
      it('offers a secondary "Anular esta venta" below "Siguiente venta"', async () => {
        await registerSale();

        const actions = buttons(confirmation()!).map((candidate) => candidate.textContent?.trim());
        expect(actions).toEqual(['Siguiente venta', 'Anular esta venta']);
        expect(document.activeElement?.textContent?.trim()).toBe('Siguiente venta');
        expect(button('Anular esta venta').classList).toContain('void');
      });

      it('asks to confirm with the amount charged, tip included, pointing to Devolución', async () => {
        await registerSale();

        await tap(button('Anular esta venta'));

        expect(voidDialog()!.querySelector('h2')?.textContent).toBe(
          '¿Anular venta de $8.000 (Efectivo)?',
        );
        expect(voidDialog()!.textContent).toContain(
          '20:15 · 1× Jack Daniels Original · 1× Red Bull',
        );
        expect(voidDialog()!.querySelector('.help')?.textContent).toBe(
          '¿Hay que devolver plata? Usa Devolución',
        );
        // Voiding moves no money: no reminder to give anything back.
        expect(voidDialog()!.textContent).not.toContain('Devuelve');
        expect(voidDialog()!.querySelectorAll('input')).toHaveLength(1);
        expect(document.activeElement?.textContent?.trim()).toBe('Volver');
      });

      it('never mentions a Mercado Pago refund for Mercado Pago sales', async () => {
        await registerSale({ ...CASH_SALE, paymentMethod: 'MERCADO_PAGO' });

        await tap(button('Anular esta venta'));

        expect(voidDialog()!.querySelector('h2')?.textContent).toBe(
          '¿Anular venta de $8.000 (Mercado Pago)?',
        );
        expect(voidDialog()!.textContent).not.toContain('app de Mercado Pago');
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
        expect(toast()?.querySelector('p')?.textContent).toBe('Venta anulada.');

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

        expect(voidDialog()!.querySelector('[role="alert"]')?.textContent).toBe(
          'La venta 501 no existe.',
        );
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
        lines: [
          {
            variantId: 11,
            variantName: 'Normal',
            productId: 1,
            productName: 'Cerveza',
            quantity: 2,
          },
        ],
        subtotal: 5000,
        tipAmount: 0,
        amountToCharge: 5000,
        createdAt: '2026-10-31T23:40:00Z',
      };
      const VOIDED_SALE = voided(
        { ...CASH_SALE, id: 500, createdAt: '2026-10-31T23:05:00Z' },
        'monto mal digitado',
      );

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
        expect(voidDialog()!.querySelector('h2')?.textContent).toBe(
          '¿Anular venta de $5.000 (Mercado Pago)?',
        );
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
        expect(toast()?.querySelector('p')?.textContent).toBe('Venta anulada.');
      });

      it('reloads the list on 409, as another phone may have voided the sale', async () => {
        await setup();
        await openRecent([CASH_SALE]);
        await tap(rows()[0].querySelector<HTMLButtonElement>('button.void')!);

        await confirmVoid();
        httpTesting.expectOne('/api/sales/501/void').flush(
          {
            title: 'Venta ya anulada',
            status: 409,
            detail: 'La venta 501 ya está anulada (a las 20:18).',
          },
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

      it('reloads sales and refunds on "Reintentar"', async () => {
        await setup();
        button('Ventas').click();
        TestBed.tick();
        httpTesting
          .expectOne('/api/sales')
          .flush({ status: 500, detail: 'Error interno.' }, { status: 500, statusText: 'Error' });
        httpTesting.expectOne('/api/refunds').flush([]);
        await fixture.whenStable();

        button('Reintentar').click();
        TestBed.tick();
        httpTesting.expectOne('/api/sales').flush([CASH_SALE]);
        httpTesting.expectOne('/api/refunds').flush([REFUND]);
        await fixture.whenStable();

        expect(entries()).toHaveLength(2);
      });

      it('links to the totals', async () => {
        await setup();

        await openRecent([]);

        const link = sheet()!.querySelector<HTMLAnchorElement>('a.totals')!;
        expect(link.textContent?.trim()).toBe('Totales →');
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
          .flush(
            { status: 500, detail: 'Error interno.' },
            { status: 500, statusText: 'Server Error' },
          );
        httpTesting.expectOne('/api/refunds').flush([]);
        await fixture.whenStable();

        expect(sheet()!.querySelector('[role="alert"]')?.textContent).toContain('Error interno.');
        button('Reintentar').click();
        TestBed.tick();
        httpTesting.expectOne('/api/sales').flush([CASH_SALE]);
        httpTesting.expectOne('/api/refunds').flush([]);
        await fixture.whenStable();
        expect(rows()).toHaveLength(1);
      });
    });

    describe('refunds', () => {
      function refundDialog(): HTMLElement | null {
        return root().querySelector('app-refund-dialog [role="dialog"]');
      }

      function voidRefundDialog(): HTMLElement | null {
        return root().querySelector('app-void-refund-dialog [role="alertdialog"]');
      }

      function refundRows(): HTMLElement[] {
        return Array.from(sheet()!.querySelectorAll<HTMLElement>('li.refund'));
      }

      async function type(input: HTMLInputElement, value: string): Promise<void> {
        input.value = value;
        input.dispatchEvent(new Event('input'));
        await fixture.whenStable();
      }

      async function fillRefund(amount: string, reason: string): Promise<void> {
        const [amountInput, reasonInput] = Array.from(
          refundDialog()!.querySelectorAll<HTMLInputElement>('input'),
        );
        await type(amountInput, amount);
        await type(reasonInput, reason);
      }

      it('offers "Devolución" next to the title, for barra too, with an open event', async () => {
        await setup();

        await openRecent([]);

        const header = sheet()!.querySelector('.header')!;
        expect(Array.from(header.children).map((child) => child.textContent?.trim())).toEqual([
          'Últimas ventas',
          'Devolución',
          'Totales →',
        ]);
      });

      it('hides "Devolución" without an open event', async () => {
        await setup(null);

        await openRecent([]);

        expect(sheet()!.querySelector('button.start-refund')).toBeNull();
      });

      it('mixes sales and refunds by time, newest first', async () => {
        await setup();

        await openRecent(
          [
            { ...CASH_SALE, id: 1, createdAt: '2026-10-31T23:40:00Z' },
            { ...CASH_SALE, id: 2, createdAt: '2026-10-31T23:10:00Z' },
          ],
          [
            { ...REFUND, id: 7, createdAt: '2026-10-31T23:30:00.250Z' },
            { ...REFUND, id: 8, createdAt: '2026-11-01T00:05:00Z', reason: 'la última' },
          ],
        );

        expect(
          entries().map(
            (entry) => `${entry.className} ${entry.querySelector('time')?.textContent}`,
          ),
        ).toEqual(['refund 21:05', 'sale 20:40', 'refund 20:30', 'sale 20:10']);
        const [latest] = refundRows();
        expect(latest.textContent).toContain('Devolución');
        expect(latest.textContent).toContain('Motivo: la última');
        expect(latest.querySelector('.amount')?.textContent).toBe('−$15.000');
        expect(latest.querySelector('button.void')).not.toBeNull();
      });

      it('shows a voided refund struck through, without "Anular"', async () => {
        await setup();

        await openRecent([], [{ ...REFUND, status: 'VOIDED', voidedAt: '2026-10-31T23:35:00Z' }]);

        const [row] = refundRows();
        expect(row.classList).toContain('voided');
        expect(row.querySelector('.badge')?.textContent).toBe('Anulada 20:35');
        expect(row.querySelector('button.void')).toBeNull();
      });

      it('still shows the sales when the refunds fail to load', async () => {
        await setup();
        button('Ventas').click();
        TestBed.tick();
        httpTesting.expectOne('/api/sales').flush([CASH_SALE]);
        // A backend older than DRAMA-41 denies the unknown endpoint.
        httpTesting
          .expectOne('/api/refunds')
          .flush({ status: 403, detail: 'Sin permiso.' }, { status: 403, statusText: 'Forbidden' });
        await fixture.whenStable();

        expect(rows()).toHaveLength(1);
        expect(sheet()!.querySelector('.warning')?.textContent).toBe(
          'No se pudieron cargar las devoluciones.',
        );
      });

      it('records a refund, lists it on top and reminds what to hand over', async () => {
        await setup();
        await openRecent([CASH_SALE]);

        await tap(button('Devolución'));
        expect(refundDialog()!.querySelector('h2')?.textContent).toBe('Devolución de efectivo');
        await fillRefund('15000', '  se acabó el Jack ');
        const confirm = button('Entregar $15.000 de la caja');
        confirm.click();
        TestBed.tick();
        confirm.click();
        TestBed.tick();

        expect(confirm.textContent?.trim()).toBe('Registrando…');
        const request = httpTesting.expectOne('/api/refunds');
        expect(request.request.method).toBe('POST');
        expect(request.request.body).toEqual({ amount: 15000, reason: 'se acabó el Jack' });
        request.flush({ ...REFUND, id: 9, createdAt: '2026-11-01T00:30:00Z' });
        await fixture.whenStable();

        expect(refundDialog()).toBeNull();
        expect(entries()[0].classList).toContain('refund');
        expect(toast()?.querySelector('p')?.textContent).toBe(
          'Devolución registrada. Entrega $15.000 de la caja.',
        );
      });

      it('keeps the dialog open with the detail when the event was closed', async () => {
        await setup();
        await openRecent([]);
        await tap(button('Devolución'));
        await fillRefund('15000', 'prueba');

        button('Entregar $15.000 de la caja').click();
        TestBed.tick();
        httpTesting.expectOne('/api/refunds').flush(
          {
            title: 'Sin evento abierto',
            status: 409,
            detail: 'No hay un evento abierto. Abre un evento antes de registrar devoluciones.',
          },
          { status: 409, statusText: 'Conflict' },
        );
        TestBed.tick();
        httpTesting.expectOne('/api/events/current').flush(OPEN_EVENT);
        await fixture.whenStable();

        expect(refundDialog()!.querySelector('[role="alert"]')?.textContent).toBe(
          'No hay un evento abierto. Abre un evento antes de registrar devoluciones.',
        );
        expect(toast()).toBeNull();
      });

      it('closes only the refund dialog on Escape', async () => {
        await setup();
        await openRecent([]);
        await tap(button('Devolución'));

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        await fixture.whenStable();

        expect(refundDialog()).toBeNull();
        expect(sheet()).not.toBeNull();
        httpTesting.expectNone('/api/refunds');
      });

      it('voids a refund entered by mistake and shows it struck through', async () => {
        await setup();
        await openRecent([], [REFUND]);

        await tap(refundRows()[0].querySelector<HTMLButtonElement>('button.void')!);
        expect(voidRefundDialog()!.querySelector('h2')?.textContent).toBe(
          '¿Anular devolución de $15.000?',
        );
        expect(voidRefundDialog()!.textContent).toContain('20:30 · Motivo: se acabó el Jack');
        expect(voidRefundDialog()!.textContent).toContain('Solo si se ingresó mal.');
        expect(document.activeElement?.textContent?.trim()).toBe('Volver');
        button('Anular devolución').click();
        TestBed.tick();
        const request = httpTesting.expectOne('/api/refunds/7/void');
        expect(request.request.method).toBe('POST');
        request.flush({ ...REFUND, status: 'VOIDED', voidedAt: '2026-10-31T23:35:00Z' });
        await fixture.whenStable();

        expect(voidRefundDialog()).toBeNull();
        expect(refundRows()[0].classList).toContain('voided');
        expect(refundRows()[0].querySelector('button.void')).toBeNull();
        expect(toast()?.querySelector('p')?.textContent).toBe('Devolución anulada.');
      });

      it('reloads the refunds on 409, as another phone may have voided it', async () => {
        await setup();
        await openRecent([], [REFUND]);
        await tap(refundRows()[0].querySelector<HTMLButtonElement>('button.void')!);

        button('Anular devolución').click();
        TestBed.tick();
        httpTesting.expectOne('/api/refunds/7/void').flush(
          {
            title: 'Devolución ya anulada',
            status: 409,
            detail: 'La devolución 7 ya está anulada (a las 20:35).',
          },
          { status: 409, statusText: 'Conflict' },
        );
        TestBed.tick();
        httpTesting
          .expectOne('/api/refunds')
          .flush([{ ...REFUND, status: 'VOIDED', voidedAt: '2026-10-31T23:35:00Z' }]);
        httpTesting.expectOne('/api/events/current').flush(OPEN_EVENT);
        await fixture.whenStable();

        expect(voidRefundDialog()!.querySelector('[role="alert"]')?.textContent).toBe(
          'La devolución 7 ya está anulada (a las 20:35).',
        );
        await tap(button('Volver'));
        expect(refundRows()[0].classList).toContain('voided');
      });
    });
  });
  describe('event load error', () => {
    it('says "Sin conexión ↻" in the header and the full message in its own row', async () => {
      fixture = TestBed.createComponent(SalePage);
      TestBed.tick();
      httpTesting.expectOne('/api/events/current').error(new ProgressEvent('error'));
      httpTesting.expectOne('/api/products').flush(MENU);
      await fixture.whenStable();

      expect(root().querySelector('.status')?.textContent).toContain('Sin conexión');
      expect(root().querySelector('.status')?.textContent).not.toContain('No se pudo');
      const row = root().querySelector('.event-error')!;
      expect(row.closest('header')).toBeNull();
      expect(row.textContent).toContain(`No se pudo cargar el evento. ${NO_CONNECTION_MESSAGE}`);

      await tap(button('Reintentar'));
      httpTesting.expectOne('/api/events/current').flush(OPEN_EVENT);
      await fixture.whenStable();

      expect(root().querySelector('.event-error')).toBeNull();
      expect(root().querySelector('.event-name')?.textContent).toBe('DRAMA Octubre');
    });
  });

  describe('keeping the cart across reloads', () => {
    beforeEach(() => signIn());

    afterEach(() => vi.useRealTimers());

    /** Red Bull + 2 Jack Daniels Original, $1.000 tip, Efectivo: $19.500. */
    async function buildOrder(): Promise<void> {
      await setup();
      await tap(productButton('Red Bull'));
      await tap(productButton('Jack Daniels'));
      await tap(button('Original'));
      await tap(
        root().querySelector<HTMLButtonElement>(
          '[aria-label="Agregar uno de Jack Daniels Original"]',
        )!,
      );
      await tap(button('$1.000'));
      await tap(button('Efectivo'));
    }

    function pendingNotice(): HTMLElement | null {
      return root().querySelector('app-pending-sale-notice');
    }

    it('brings back the lines and the tip, priced with the current menu, but not the payment method', async () => {
      await buildOrder();
      const repriced = MENU.map((product) =>
        product.id === 9 ? { ...product, promoPrice: 16000 } : product,
      );

      await reload(OPEN_EVENT, repriced);

      expect(cartLabels()).toEqual(['Red Bull', 'Jack Daniels · Original']);
      expect(button('$1.000').getAttribute('aria-pressed')).toBe('true');
      expect(root().querySelector('app-checkout-bar .amount')?.textContent).toContain('$20.500');
      expect(button('Efectivo').getAttribute('aria-pressed')).toBe('false');
      expect(text()).toContain('Elige el medio de pago.');
      expect(toast()?.textContent).toContain('Pedido recuperado · 3 productos');
    });

    it('closes "Pedido recuperado" on its own after 4 s', async () => {
      await buildOrder();
      vi.useFakeTimers({ shouldAdvanceTime: true });

      await reload();
      expect(toast()).not.toBeNull();
      vi.advanceTimersByTime(RESTORED_NOTICE_MS);
      TestBed.tick();

      expect(toast()).toBeNull();
    });

    it('names the products no longer on the menu, until the notice is closed', async () => {
      await buildOrder();
      vi.useFakeTimers({ shouldAdvanceTime: true });

      await reload(
        OPEN_EVENT,
        MENU.filter((product) => product.id !== 12),
      );
      vi.advanceTimersByTime(RESTORED_NOTICE_MS);
      TestBed.tick();

      expect(cartLabels()).toEqual(['Jack Daniels · Original']);
      expect(toast()?.textContent).toContain(
        'Pedido recuperado. Se quitó Red Bull (ya no está en la carta)',
      );
      toast()!.querySelector('button')!.click();
      TestBed.tick();
      expect(toast()).toBeNull();
    });

    it.each([
      ['another event', { ...OPEN_EVENT, id: 8 }],
      ['no open event', null],
    ])('discards the cart of %s', async (_, event) => {
      await buildOrder();

      await reload(event);

      expect(cartLabels()).toEqual([]);
      expect(toast()).toBeNull();
      expect(saved()).toBeNull();
    });

    it('waits, neither restoring nor discarding, while the event cannot be loaded', async () => {
      await buildOrder();
      const before = storage.getItem(CART_STORAGE_KEY);
      fixture.destroy();
      httpTesting.verify();
      TestBed.resetTestingModule();
      await configure();
      signIn();
      fixture = TestBed.createComponent(SalePage);
      TestBed.tick();
      httpTesting.expectOne('/api/events/current').error(new ProgressEvent('error'));
      httpTesting.expectOne('/api/products').flush(MENU);
      await fixture.whenStable();

      expect(cartLabels()).toEqual([]);
      expect(storage.getItem(CART_STORAGE_KEY)).toBe(before);

      await tap(button('Reintentar'));
      httpTesting.expectOne('/api/events/current').flush(OPEN_EVENT);
      await fixture.whenStable();

      expect(cartLabels()).toEqual(['Red Bull', 'Jack Daniels · Original']);
    });

    it('forgets the saved cart once the sale is registered', async () => {
      await buildOrder();

      confirmButton().click();
      TestBed.tick();
      expect(saved()).toMatchObject({
        status: 'sending',
        sending: { paymentMethod: 'EFECTIVO', amountToCharge: 19500 },
      });
      httpTesting
        .expectOne('/api/sales')
        .flush(saleResponse({ subtotal: 18500, tipAmount: 1000, amountToCharge: 19500 }));
      await fixture.whenStable();

      expect(saved()).toBeNull();
      await reload();
      expect(cartLabels()).toEqual([]);
    });

    describe('a sale sent without an answer', () => {
      async function reloadDuringTheSale(): Promise<void> {
        await buildOrder();
        confirmButton().click();
        TestBed.tick();
        httpTesting.expectOne('/api/sales');
        await reload();
      }

      it('after a reload, blocks confirming and shows what was sent, keeping cart and confirm in view', async () => {
        await reloadDuringTheSale();

        const notice = pendingNotice()!;
        expect(notice.textContent).toContain('Esta venta pudo haberse registrado');
        expect(notice.textContent).toMatch(/\d\d:\d\d · Efectivo · \$19\.500/);
        expect(cartLabels()).toEqual(['Red Bull', 'Jack Daniels · Original']);
        expect(confirmButton().disabled).toBe(true);
        // The notice already says why: no repeated hint, the space is needed at 375px.
        expect(root().querySelector('app-checkout-bar .hint')).toBeNull();
        // It takes the place of the tip and payment buttons, not of the cart or the confirm button.
        expect(root().querySelector('app-tip-selector')).toBeNull();
        expect(root().querySelector('app-checkout-bar .methods')).toBeNull();
        expect(toast()).toBeNull();
      });

      it('"Ver ventas" opens the latest sales', async () => {
        await reloadDuringTheSale();

        button('Ver ventas').click();
        TestBed.tick();
        httpTesting.expectOne('/api/sales').flush([]);
        httpTesting.expectOne('/api/refunds').flush([]);
        await fixture.whenStable();

        expect(root().querySelector('app-recent-sales-sheet')).not.toBeNull();
      });

      it('"Ya está: vaciar" starts a new sale', async () => {
        await reloadDuringTheSale();

        await tap(button('Ya está: vaciar'));

        expect(pendingNotice()).toBeNull();
        expect(cartLabels()).toEqual([]);
        expect(button('Sin propina').getAttribute('aria-pressed')).toBe('true');
        expect(saved()).toBeNull();
      });

      it('"No está: seguir" lets it be confirmed again', async () => {
        await reloadDuringTheSale();

        await tap(button('No está: seguir'));

        expect(pendingNotice()).toBeNull();
        expect(saved()).toMatchObject({ status: 'editing', sending: null });
        await tap(button('Mercado Pago'));
        expect(confirmButton().disabled).toBe(false);
      });

      it('"Vaciar" is disabled while the sale is being sent', async () => {
        await buildOrder();

        confirmButton().click();
        TestBed.tick();
        httpTesting.expectOne('/api/sales');
        await fixture.whenStable();

        expect(button('Vaciar').disabled).toBe(true);
      });

      it('"Vaciar" is disabled while it may have been registered, and the notice survives a reload', async () => {
        await reloadDuringTheSale();

        expect(button('Vaciar').disabled).toBe(true);
        await tap(button('Vaciar'));
        expect(cartLabels()).toEqual(['Red Bull', 'Jack Daniels · Original']);
        expect(saved()).toMatchObject({ status: 'sending' });

        await reload();

        expect(pendingNotice()?.textContent).toContain('Esta venta pudo haberse registrado');
        expect(cartLabels()).toEqual(['Red Bull', 'Jack Daniels · Original']);
      });

      it('"Vaciar" works again once the notice is answered', async () => {
        await reloadDuringTheSale();

        await tap(button('No está: seguir'));
        expect(button('Vaciar').disabled).toBe(false);
        await tap(button('Vaciar'));

        expect(cartLabels()).toEqual([]);
        expect(saved()).toBeNull();
      });

      it('"Vaciar" works again for the next order after "Ya está: vaciar"', async () => {
        await reloadDuringTheSale();

        await tap(button('Ya está: vaciar'));
        await tap(productButton('Red Bull'));

        expect(button('Vaciar').disabled).toBe(false);
      });

      it('gives up after 15 s without an answer: asks to check, and ignores a late answer', async () => {
        await buildOrder();
        vi.useFakeTimers();

        confirmButton().click();
        TestBed.tick();
        const request = httpTesting.expectOne('/api/sales');

        vi.advanceTimersByTime(SALE_REQUEST_TIMEOUT_MS - 100);
        TestBed.tick();
        expect(pendingNotice()).toBeNull();
        expect(confirmButton().textContent).toContain('Registrando');

        vi.advanceTimersByTime(100);
        TestBed.tick();
        expect(pendingNotice()?.textContent).toContain('Esta venta pudo haberse registrado');
        expect(confirmButton().disabled).toBe(true);
        expect(confirmButton().textContent).toContain('Confirmar venta');
        expect(saved()).toMatchObject({ status: 'sending' });
        // Cancelled: whatever the backend answers later never reaches the page.
        expect(request.cancelled).toBe(true);
      });

      it.each([
        ['no connection', (request: TestRequest) => request.error(new ProgressEvent('error'))],
        [
          'a 502 from the proxy',
          (request: TestRequest) =>
            request.flush('<html>Bad Gateway</html>', { status: 502, statusText: 'Bad Gateway' }),
        ],
        [
          'a 500',
          (request: TestRequest) =>
            request.flush({ status: 500 }, { status: 500, statusText: 'Server Error' }),
        ],
      ])('asks the same without reloading after %s', async (_, answer) => {
        await buildOrder();

        confirmButton().click();
        TestBed.tick();
        answer(httpTesting.expectOne('/api/sales'));
        await fixture.whenStable();

        expect(pendingNotice()).not.toBeNull();
        expect(confirmButton().disabled).toBe(true);
        expect(saved()).toMatchObject({ status: 'sending' });
      });

      it.each([
        [400, 'Venta inválida.'],
        [409, EVENT_CLOSED_MESSAGE],
      ])('a %i proves it was not registered: back to editing', async (status, message) => {
        await buildOrder();

        confirmButton().click();
        TestBed.tick();
        httpTesting
          .expectOne('/api/sales')
          .flush({ status, detail: 'Venta inválida.' }, { status, statusText: 'Error' });
        await fixture.whenStable();
        if (status === 409) {
          httpTesting.expectOne('/api/events/current').flush(OPEN_EVENT);
          await fixture.whenStable();
        }

        expect(pendingNotice()).toBeNull();
        expect(text()).toContain(message);
        expect(saved()).toMatchObject({ status: 'editing', sending: null });
        expect(confirmButton().disabled).toBe(false);
      });
    });

    describe('"Vaciar"', () => {
      async function emptyWithUndo(): Promise<void> {
        await buildOrder();
        vi.useFakeTimers({ shouldAdvanceTime: true });
        button('Vaciar').click();
        TestBed.tick();
      }

      function customTip(): HTMLInputElement {
        return root().querySelector<HTMLInputElement>('app-tip-selector input')!;
      }

      function hasUndo(): boolean {
        return buttons().some((candidate) => candidate.textContent?.trim() === 'Deshacer');
      }

      it('also removes the tip, so it does not reach the next customer', async () => {
        await emptyWithUndo();

        expect(button('Sin propina').getAttribute('aria-pressed')).toBe('true');
        expect(button('$1.000').getAttribute('aria-pressed')).toBe('false');
        expect(root().querySelector('app-checkout-bar .amount')?.textContent).toContain('$0');
        expect(saved()).toBeNull();
      });

      it('"Deshacer" within 5 s brings the lines and the tip back and saves them again', async () => {
        await emptyWithUndo();
        expect(saved()).toBeNull();

        vi.advanceTimersByTime(UNDO_EMPTY_MS - 1);
        button('Deshacer').click();
        TestBed.tick();

        expect(cartLabels()).toEqual(['Red Bull', 'Jack Daniels · Original']);
        expect(button('$1.000').getAttribute('aria-pressed')).toBe('true');
        expect(saved()?.['lines']).toHaveLength(2);
        expect(saved()?.['tip']).toEqual({ amount: 1000, custom: false });
      });

      it('"Deshacer" brings back a custom tip', async () => {
        await buildOrder();
        const input = customTip();
        input.dispatchEvent(new Event('focus'));
        input.value = '3500';
        input.dispatchEvent(new Event('input'));
        input.dispatchEvent(new Event('blur'));
        await fixture.whenStable();

        await tap(button('Vaciar'));
        expect(customTip().value).toBe('');
        await tap(button('Deshacer'));

        expect(customTip().value).toBe('3500');
        expect(customTip().classList).toContain('selected');
        expect(saved()?.['tip']).toEqual({ amount: 3500, custom: true });
      });

      it('choosing a tip stops offering "Deshacer", which would overwrite it', async () => {
        await emptyWithUndo();

        button('$500').click();
        TestBed.tick();

        expect(hasUndo()).toBe(false);
        expect(button('$500').getAttribute('aria-pressed')).toBe('true');
      });

      it('stops offering "Deshacer" after 5 s, still without the tip', async () => {
        await emptyWithUndo();

        vi.advanceTimersByTime(UNDO_EMPTY_MS);
        TestBed.tick();

        expect(text()).toContain('Carrito (0)');
        expect(hasUndo()).toBe(false);
        expect(button('Sin propina').getAttribute('aria-pressed')).toBe('true');
      });

      it('a reload right after it comes back empty, without "Deshacer"', async () => {
        await emptyWithUndo();
        vi.useRealTimers();

        await reload();

        expect(cartLabels()).toEqual([]);
        expect(text()).toContain('Carrito (0)');
        expect(toast()).toBeNull();
      });

      it('the next order is saved and restored without the emptied tip', async () => {
        await emptyWithUndo();
        vi.useRealTimers();

        await tap(productButton('Red Bull'));
        expect(saved()?.['tip']).toEqual({ amount: 0, custom: false });
        await reload();

        expect(cartLabels()).toEqual(['Red Bull']);
        expect(button('Sin propina').getAttribute('aria-pressed')).toBe('true');
      });
    });
  });
});
