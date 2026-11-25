import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MemoryStorage } from '../../testing/memory-storage';
import { AuthStore } from '../auth/auth-store';
import { EventResponse } from '../event/event';
import { PointOrderResponse } from '../point/point';
import { POINT_CHARGE_STORAGE_KEY } from '../point/point-charge-store';
import { POINT_STORAGE, PointTerminalStore } from '../point/point-terminal-store';
import { ProductResponse } from '../product/product';
import { CART_STORAGE } from './cart-storage';
import { CartStore } from './cart-store';
import { PaymentMethod } from './sale';
import { SalePage } from './sale-page';

const OPEN_EVENT: EventResponse = {
  id: 7,
  name: 'DRAMA Noviembre',
  eventDate: '2026-11-27',
  status: 'OPEN',
  openedAt: '2026-11-27T22:00:00Z',
  closedAt: null,
};

const RED_BULL: ProductResponse = {
  id: 12,
  name: 'Red Bull',
  unitPrice: 3500,
  promoQuantity: null,
  promoPrice: null,
  variants: [{ id: 121, name: 'Única' }],
};

const WATER: ProductResponse = {
  id: 13,
  name: 'Agua 600cc',
  unitPrice: 3000,
  promoQuantity: 2,
  promoPrice: 5000,
  variants: [{ id: 131, name: 'Única' }],
};

const SMART = { id: 'SMART-1', name: 'Smart 1' };
const ORDER_URL = '/api/sales/182/point-order';

function order(changes: Partial<PointOrderResponse> = {}): PointOrderResponse {
  return {
    saleId: 182,
    state: 'WAITING',
    status: 'at_terminal',
    statusDetail: null,
    amount: 8000,
    terminalId: 'SMART-1',
    terminalName: 'Smart 1',
    secondsSinceCreated: 1,
    cancelRequested: false,
    saleStatus: 'ACTIVE',
    voidReason: null,
    pendingVerification: false,
    paidOnVoidedSale: false,
    vale: null,
    ...changes,
  };
}

/** Venta on a phone that charges with a Point Smart. With a Point Mini: sale-page.spec.ts, untouched. */
describe('SalePage with a Point Smart', () => {
  let httpTesting: HttpTestingController;
  let fixture: ComponentFixture<SalePage>;
  let storage: MemoryStorage;

  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn<() => void>();
    storage = new MemoryStorage();
    configure();
    TestBed.inject(PointTerminalStore).set(SMART);
  });

  afterEach(() => {
    fixture.destroy();
    httpTesting.verify();
    delete (Element.prototype as Partial<Element>).scrollIntoView;
  });

  function configure(): void {
    TestBed.configureTestingModule({
      imports: [SalePage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: CART_STORAGE, useValue: storage },
        { provide: POINT_STORAGE, useValue: storage },
      ],
    });
    httpTesting = TestBed.inject(HttpTestingController);
    TestBed.inject(AuthStore).signedIn({
      username: 'barra',
      role: 'BARRA',
      expiresAt: new Date(Date.now() + 20 * 60 * 60 * 1000).toISOString(),
    });
  }

  function open(): void {
    fixture = TestBed.createComponent(SalePage);
    fixture.detectChanges();
    httpTesting.expectOne('/api/events/current').flush(OPEN_EVENT);
  }

  async function setup(menu = [RED_BULL, WATER]): Promise<void> {
    open();
    httpTesting.expectOne('/api/products').flush(menu);
    await update();
  }

  /** The menu (a resource) and the effects it triggers settle asynchronously. */
  async function update(): Promise<void> {
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
  }

  async function reload(menu = [RED_BULL, WATER]): Promise<void> {
    fixture.destroy();
    httpTesting.match(() => true);
    TestBed.resetTestingModule();
    configure();
    await setup(menu);
  }

  function root(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function button(label: string): HTMLButtonElement {
    return [...root().querySelectorAll('button')].find(
      (candidate) => candidate.textContent!.trim() === label,
    )!;
  }

  async function tap(label: string): Promise<void> {
    button(label).click();
    await update();
  }

  function cart(): CartStore {
    return TestBed.inject(CartStore);
  }

  /** 1 Red Bull, 1 Agua and a tip of $1.500, confirmed. */
  async function sell(method: PaymentMethod = 'MERCADO_PAGO'): Promise<void> {
    cart().add(RED_BULL, RED_BULL.variants[0]);
    cart().add(WATER, WATER.variants[0]);
    cart().setTip({ amount: 1500, custom: true });
    await update();
    await tap(method === 'MERCADO_PAGO' ? 'Mercado Pago · Smart 1' : 'Efectivo');
    await tap('Confirmar venta');
    httpTesting.expectOne({ method: 'POST', url: '/api/sales' }).flush({
      id: 182,
      eventId: 7,
      paymentMethod: method,
      lines: [],
      subtotal: 6500,
      tipAmount: 1500,
      amountToCharge: 8000,
      createdAt: '2026-11-28T04:32:00Z',
      status: 'ACTIVE',
      voidedAt: null,
      voidReason: null,
      outOfStockVariantIds: [],
    });
    await update();
  }

  function screen(): Element | null {
    return root().querySelector('app-point-charge-screen');
  }

  function sent(): ReturnType<HttpTestingController['expectOne']> {
    return httpTesting.expectOne({ method: 'POST', url: ORDER_URL });
  }

  async function goBack(changes: Partial<PointOrderResponse> = {}): Promise<void> {
    await tap('Volver al carrito');
    httpTesting.expectOne(`${ORDER_URL}/cancel`).flush(
      order({
        state: 'CANCELED',
        status: 'canceled',
        saleStatus: 'VOIDED',
        voidReason: 'Vuelta al carrito (no cobrada)',
        ...changes,
      }),
    );
    await update();
  }

  it('names the Smart on the Mercado Pago button', async () => {
    await setup();

    expect(button('Mercado Pago · Smart 1')).toBeTruthy();
    TestBed.inject(PointTerminalStore).set(null);
    await update();
    expect(button('Mercado Pago')).toBeTruthy();
  });

  it('charges the registered sale with the Smart instead of showing the amount to type', async () => {
    await setup();
    await sell();

    expect(root().querySelector('app-sale-confirmation')).toBeNull();
    expect(screen()).not.toBeNull();
    const request = sent();
    expect(request.request.body).toEqual({ terminalId: 'SMART-1', cancelPendingVale: false });
    request.flush(order());
    await update();
    expect(screen()!.textContent).toContain('$8.000');
    expect(cart().isEmpty()).toBe(true);
    expect(storage.json(POINT_CHARGE_STORAGE_KEY)).toMatchObject({ saleId: 182, amount: 8000 });
  });

  it('keeps the Smart that was chosen when the sale was confirmed', async () => {
    await setup();
    cart().add(RED_BULL, RED_BULL.variants[0]);
    await update();
    await tap('Mercado Pago · Smart 1');
    await tap('Confirmar venta');
    TestBed.inject(PointTerminalStore).set(null);
    httpTesting
      .expectOne({ method: 'POST', url: '/api/sales' })
      .flush({ id: 182, amountToCharge: 3500, tipAmount: 0, lines: [] });
    await update();

    expect(sent().request.body).toMatchObject({ terminalId: 'SMART-1' });
  });

  it('goes on to the next sale once it is paid', async () => {
    await setup();
    await sell();
    sent().flush(order({ state: 'PAID', status: 'processed' }));
    await update();

    await tap('Siguiente venta');

    expect(screen()).toBeNull();
    expect(cart().isEmpty()).toBe(true);
    expect(storage.getItem(POINT_CHARGE_STORAGE_KEY)).toBeNull();
  });

  it('brings the order back, with its tip, when nothing was charged', async () => {
    await setup();
    await sell();
    sent().flush(order());
    await update();
    await goBack();

    expect(screen()).toBeNull();
    expect(
      cart()
        .lines()
        .map((line) => [line.product.name, line.quantity]),
    ).toEqual([
      ['Red Bull', 1],
      ['Agua 600cc', 1],
    ]);
    expect(cart().tip()).toEqual({ amount: 1500, custom: true });
    expect(root().querySelector('.toast')!.textContent).toContain(
      'Vuelta al carrito (no cobrada). El pedido volvió al carrito.',
    );
    expect(storage.getItem(POINT_CHARGE_STORAGE_KEY)).toBeNull();
  });

  it('finds the charge again after a reload, without sending it again', async () => {
    await setup();
    await sell();
    sent().flush(order());
    await update();

    await reload();

    expect(screen()).not.toBeNull();
    httpTesting.expectNone({ method: 'POST', url: ORDER_URL });
    httpTesting.expectOne({ method: 'GET', url: ORDER_URL }).flush(order());
    await update();
    expect(screen()!.textContent).toContain('Esperando pago…');
  });

  it('brings the order back after a reload too, naming what is no longer on the menu', async () => {
    await setup();
    await sell();
    sent().flush(order());
    await update();
    await reload([RED_BULL]);
    httpTesting.expectOne({ method: 'GET', url: ORDER_URL }).flush(order());
    await update();
    await goBack();

    expect(
      cart()
        .lines()
        .map((line) => line.product.name),
    ).toEqual(['Red Bull']);
    expect(root().querySelector('.toast')!.textContent).toContain('Agua 600cc');
  });

  it('waits for the menu to bring the order back', async () => {
    await setup();
    await sell();
    sent().flush(order());
    await update();
    fixture.destroy();
    httpTesting.match(() => true);
    TestBed.resetTestingModule();
    configure();
    open();
    await update();
    const menu = httpTesting.expectOne('/api/products');
    httpTesting.expectOne({ method: 'GET', url: ORDER_URL }).flush(order());
    await update();
    await goBack();
    expect(cart().isEmpty()).toBe(true);
    expect(storage.getItem(POINT_CHARGE_STORAGE_KEY)).not.toBeNull();

    menu.flush([RED_BULL, WATER]);
    await update();

    expect(cart().lines()).toHaveLength(2);
    expect(storage.getItem(POINT_CHARGE_STORAGE_KEY)).toBeNull();
  });

  it('a failed registration starts no charge', async () => {
    await setup();
    cart().add(RED_BULL, RED_BULL.variants[0]);
    await update();
    await tap('Mercado Pago · Smart 1');
    await tap('Confirmar venta');
    httpTesting
      .expectOne({ method: 'POST', url: '/api/sales' })
      .flush({ detail: 'No.' }, { status: 400, statusText: 'Bad Request' });
    await update();

    expect(screen()).toBeNull();
    expect(cart().itemCount()).toBe(1);
  });
});
