import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MemoryStorage } from '../../testing/memory-storage';
import { AuthStore } from '../auth/auth-store';
import { EventResponse } from '../event/event';
import { PointOrderResponse, PointSaleMark, ValeResponse } from '../point/point';
import { POINT_CHARGE_STORAGE_KEY } from '../point/point-charge-store';
import { POINT_STORAGE, PointTerminalStore } from '../point/point-terminal-store';
import { ProductResponse } from '../product/product';
import { CART_STORAGE } from './cart-storage';
import { CartStore } from './cart-store';
import { PaymentMethod, SaleResponse } from './sale';
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

/** Newest first by id. */
function recentSale(id: number): SaleResponse {
  return {
    id,
    eventId: 7,
    paymentMethod: 'MERCADO_PAGO',
    lines: [],
    subtotal: 5000,
    tipAmount: 0,
    amountToCharge: 5000,
    createdAt: `2026-11-28T04:${id - 160}:00Z`,
    status: 'ACTIVE',
    voidedAt: null,
    voidReason: null,
  };
}

function vale(): ValeResponse {
  return {
    saleId: 182,
    state: 'PRINTED',
    kind: 'ORIGINAL',
    terminalId: 'SMART-1',
    terminalName: 'Smart 1',
    error: null,
    busy: false,
    mayBeDouble: false,
    secondsSinceRequested: 5,
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

  /** What opening Ventas asks for. */
  async function flushRecent(
    marks: PointSaleMark[] = [],
    sales: SaleResponse[] = [],
  ): Promise<void> {
    httpTesting.expectOne('/api/sales').flush(sales);
    httpTesting.expectOne('/api/refunds').flush([]);
    httpTesting.expectOne('/api/point/sales').flush(marks);
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

  it('a cash sale asks for the money, and prints its vale once received', async () => {
    await setup();
    await sell('EFECTIVO');

    expect(screen()).toBeNull();
    const cash = root().querySelector('app-cash-charge-screen')!;
    expect(cash.textContent).toContain('$8.000');
    await tap('Recibido');
    const request = httpTesting.expectOne({ method: 'POST', url: '/api/sales/182/vale' });
    expect(request.request.body).toEqual({ terminalId: 'SMART-1' });
    request.flush(vale());
    await update();
    await tap('Siguiente venta');

    expect(root().querySelector('app-cash-charge-screen')).toBeNull();
    expect(storage.getItem(POINT_CHARGE_STORAGE_KEY)).toBeNull();
  });

  it('voids a cash sale from its screen, also after a reload', async () => {
    await setup();
    await sell('EFECTIVO');
    await reload();
    httpTesting
      .expectOne('/api/sales/182/vale')
      .flush({ code: 'VALE_NOT_FOUND' }, { status: 404, statusText: 'Not Found' });
    await update();

    await tap('Anular esta venta');
    await tap('Anular venta');
    httpTesting
      .expectOne('/api/sales/182/void')
      .flush({ id: 182, status: 'VOIDED', voidedAt: '2026-11-28T04:33:00Z', lines: [] });
    await update();

    expect(root().querySelector('app-cash-charge-screen')).toBeNull();
    expect(storage.getItem(POINT_CHARGE_STORAGE_KEY)).toBeNull();
  });

  it('prints again the vale of the last sale after going on', async () => {
    await setup();
    await sell();
    sent().flush(order({ state: 'PAID', status: 'processed', vale: vale() }));
    await update();
    await tap('Siguiente venta');

    await tap('Ventas');
    await flushRecent();
    await tap('Reimprimir vale de la venta #182');
    httpTesting.expectOne('/api/sales/182/vale').flush(vale());
    await update();
    await tap('Reimprimir vale');
    const request = httpTesting.expectOne('/api/vales/latest/reprint');
    expect(request.request.body).toEqual({ saleId: 182, terminalId: 'SMART-1' });
    request.flush({ ...vale(), kind: 'REPRINT', mayBeDouble: true });
    await update();

    expect(root().querySelector('app-vale-dialog')!.textContent).toContain('Puede salir doble');
    await tap('Cerrar');
    expect(root().querySelector('app-vale-dialog')).toBeNull();
  });

  it('offers no reprint on a phone that has not printed', async () => {
    await setup();
    await tap('Ventas');
    await flushRecent();

    expect(root().textContent).not.toContain('Reimprimir');
  });

  it('marks in Ventas the charges someone must look at', async () => {
    await setup();
    await tap('Ventas');
    await flushRecent(
      [
        { saleId: 181, amount: 5000, pendingVerification: true, paidOnVoidedSale: false },
        { saleId: 180, amount: 18000, pendingVerification: false, paidOnVoidedSale: true },
      ],
      [recentSale(182), recentSale(181), recentSale(180)],
    );

    const rows = [...root().querySelectorAll('li.sale')].map((row) => row.textContent!);
    expect(rows[0]).not.toContain('por verificar');
    expect(rows[1]).toContain('Cerrada a mano, por verificar');
    expect(rows[2]).toContain('Cobro recibido en una venta anulada ($18.000)');
    expect(rows[2]).not.toContain('por verificar');
  });

  it('says when those marks could not be loaded, and still shows the sales', async () => {
    await setup();
    await tap('Ventas');
    httpTesting.expectOne('/api/sales').flush([recentSale(182)]);
    httpTesting.expectOne('/api/refunds').flush([]);
    httpTesting.expectOne('/api/point/sales').error(new ProgressEvent('error'));
    await update();

    expect(root().textContent).toContain('No se pudieron cargar los avisos de la Point.');
    expect(root().querySelectorAll('li.sale')).toHaveLength(1);
  });

  it('barra with a Point Mini does not ask for them', async () => {
    TestBed.inject(PointTerminalStore).set(null);
    await setup();
    await tap('Ventas');
    httpTesting.expectOne('/api/sales').flush([]);
    httpTesting.expectOne('/api/refunds').flush([]);
    await update();

    httpTesting.expectNone('/api/point/sales');
  });

  it('admin sees them with a Point Mini too', async () => {
    TestBed.inject(PointTerminalStore).set(null);
    TestBed.inject(AuthStore).signedIn({
      username: 'admin',
      role: 'ADMIN',
      expiresAt: new Date(Date.now() + 20 * 60 * 60 * 1000).toISOString(),
    });
    await setup();
    await tap('Ventas');
    await flushRecent(
      [{ saleId: 182, amount: 5000, pendingVerification: true, paidOnVoidedSale: false }],
      [recentSale(182)],
    );

    expect(root().textContent).toContain('Cerrada a mano, por verificar');
  });

  /** Confirmed, and the answer never came. */
  async function loseTheAnswer(): Promise<void> {
    cart().add(RED_BULL, RED_BULL.variants[0]);
    await update();
    await tap(
      TestBed.inject(PointTerminalStore).terminal() ? 'Mercado Pago · Smart 1' : 'Mercado Pago',
    );
    await tap('Confirmar venta');
    httpTesting.expectOne({ method: 'POST', url: '/api/sales' }).error(new ProgressEvent('error'));
    await update();
  }

  function noticeText(): string {
    return root().querySelector('app-pending-sale-notice')!.textContent!.replace(/\s+/g, ' ');
  }

  it('a sale registered without an answer is voided and confirmed again', async () => {
    await setup();
    await loseTheAnswer();

    expect(screen()).toBeNull();
    expect(noticeText()).toContain('Ya está: anúlala en Ventas y confírmala de nuevo');
    expect(button('Ya está: vaciar')).toBeUndefined();

    await tap('Ver ventas');
    await flushRecent([], [recentSale(182)]);
    await tap('Anular');
    await tap('Anular venta');
    httpTesting
      .expectOne('/api/sales/182/void')
      .flush({ ...recentSale(182), status: 'VOIDED', voidedAt: '2026-11-28T04:33:00Z' });
    await update();
    await tap('Cerrar');
    await tap('Anulada o no está: seguir');
    httpTesting.expectOne('/api/products').flush([RED_BULL, WATER]);
    await update();
    expect(cart().itemCount()).toBe(1);

    // The payment method is still chosen: it is confirmed again, and now it is charged.
    await tap('Confirmar venta');
    httpTesting
      .expectOne({ method: 'POST', url: '/api/sales' })
      .flush({ ...recentSale(183), amountToCharge: 3500 });
    await update();
    httpTesting.expectOne({ method: 'POST', url: '/api/sales/183/point-order' }).flush(order());
    await update();
    expect(screen()).not.toBeNull();
  });

  it('with a Point Mini that notice is as always', async () => {
    TestBed.inject(PointTerminalStore).set(null);
    await setup();
    await loseTheAnswer();

    expect(noticeText()).not.toContain('anúlala');
    expect(button('Ya está: vaciar')).toBeTruthy();
    expect(button('No está: seguir')).toBeTruthy();
  });

  it('that notice follows the Point the sale was sent with, not the one chosen now', async () => {
    await setup();
    await loseTheAnswer();
    TestBed.inject(PointTerminalStore).set(null);
    await update();

    expect(noticeText()).toContain('anúlala en Ventas');
    expect(button('Ya está: vaciar')).toBeUndefined();

    // After a reload too.
    await reload();
    expect(noticeText()).toContain('anúlala en Ventas');
    expect(button('Ya está: vaciar')).toBeUndefined();
  });

  it('a sale sent with a Point Mini keeps its notice when a Smart is chosen later', async () => {
    TestBed.inject(PointTerminalStore).set(null);
    await setup();
    await loseTheAnswer();
    TestBed.inject(PointTerminalStore).set(SMART);
    await update();

    expect(noticeText()).not.toContain('anúlala');
    await reload();
    expect(noticeText()).not.toContain('anúlala');
    expect(button('Ya está: vaciar')).toBeTruthy();
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
