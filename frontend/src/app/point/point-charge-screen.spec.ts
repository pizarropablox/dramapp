import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  TestRequest,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MemoryStorage } from '../../testing/memory-storage';
import { PointOrderResponse, ValeResponse } from './point';
import { PointCharge, PointChargeStore } from './point-charge-store';
import {
  CANCEL_SLOW_MS,
  CLEAR_VALE_MAX_MS,
  POLL_MS,
  PointChargeScreen,
  WAIT_VALE_MAX_MS,
  WAIT_VALE_MS,
} from './point-charge-screen';
import { POINT_STORAGE } from './point-terminal-store';
import { POINT_REQUEST_TIMEOUT_MS } from './point.service';

const CHARGE: PointCharge = {
  saleId: 182,
  kind: 'card',
  amount: 18000,
  terminal: { id: 'SMART-1', name: 'Smart 1' },
  startedAt: 0,
  lines: [],
  tip: { amount: 1000, custom: false },
  sale: null,
};

const ORDER: PointOrderResponse = {
  saleId: 182,
  state: 'WAITING',
  status: 'at_terminal',
  statusDetail: 'at_terminal',
  amount: 18000,
  terminalId: 'SMART-1',
  terminalName: 'Smart 1',
  secondsSinceCreated: 3,
  cancelRequested: false,
  saleStatus: 'ACTIVE',
  voidReason: null,
  pendingVerification: false,
  paidOnVoidedSale: false,
  vale: null,
};

const VALE: ValeResponse = {
  saleId: 182,
  state: 'PENDING',
  kind: 'ORIGINAL',
  terminalId: 'SMART-1',
  terminalName: 'Smart 1',
  error: null,
  busy: false,
  mayBeDouble: false,
  secondsSinceRequested: 0,
};

const URL = '/api/sales/182/point-order';

describe('PointChargeScreen', () => {
  let fixture: ComponentFixture<PointChargeScreen>;
  let httpTesting: HttpTestingController;
  let finished: number;
  let returned: PointOrderResponse[];

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      imports: [PointChargeScreen],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: POINT_STORAGE, useValue: new MemoryStorage() },
      ],
    });
    httpTesting = TestBed.inject(HttpTestingController);
    finished = 0;
    returned = [];
  });

  afterEach(() => {
    fixture.destroy();
    setHidden(false);
    vi.useRealTimers();
    httpTesting.verify();
  });

  function setHidden(hidden: boolean): void {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    document.dispatchEvent(new Event('visibilitychange'));
  }

  function render(fresh = true): void {
    if (fresh) {
      TestBed.inject(PointChargeStore).start(CHARGE);
    }
    fixture = TestBed.createComponent(PointChargeScreen);
    fixture.componentRef.setInput('charge', CHARGE);
    fixture.componentInstance.finished.subscribe(() => finished++);
    fixture.componentInstance.returned.subscribe((order) => returned.push(order));
    fixture.detectChanges();
  }

  function advance(ms: number): void {
    vi.advanceTimersByTime(ms);
    fixture.detectChanges();
  }

  function answer(request: TestRequest, body: object): void {
    request.flush(body);
    fixture.detectChanges();
  }

  function fail(request: TestRequest, status: number, body: object = {}): void {
    request.flush({ detail: 'Detalle.', ...body }, { status, statusText: 'Error' });
    fixture.detectChanges();
  }

  function sent(): TestRequest {
    return httpTesting.expectOne({ method: 'POST', url: URL });
  }

  function polled(): TestRequest {
    return httpTesting.expectOne({ method: 'GET', url: URL });
  }

  function canceled(): TestRequest {
    return httpTesting.expectOne({ method: 'POST', url: `${URL}/cancel` });
  }

  function resolved(): TestRequest {
    return httpTesting.expectOne({ method: 'POST', url: `${URL}/resolve` });
  }

  function order(changes: Partial<PointOrderResponse> = {}): PointOrderResponse {
    return { ...ORDER, ...changes };
  }

  function renderWith(changes: Partial<PointOrderResponse> = {}): void {
    render();
    answer(sent(), order(changes));
  }

  /** The next poll answers this. */
  function next(changes: Partial<PointOrderResponse>): void {
    advance(POLL_MS);
    answer(polled(), order(changes));
  }

  function element(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function text(): string {
    return element().textContent!.replace(/\s+/g, ' ').trim();
  }

  function title(): string {
    return element().querySelector('h2')!.textContent!.replace(/\s+/g, ' ').trim();
  }

  function buttons(): string[] {
    return [...element().querySelectorAll('button')].map((button) => button.textContent!.trim());
  }

  function button(label: string): HTMLButtonElement {
    const found = [...element().querySelectorAll('button')].find(
      (candidate) => candidate.textContent!.trim() === label,
    );
    if (!found) {
      throw new Error(`No button "${label}": ${buttons().join(', ')}`);
    }
    return found;
  }

  function tap(label: string): void {
    button(label).click();
    fixture.detectChanges();
  }

  // ---- sending --------------------------------------------------------------------------------

  it('sends the sale to its Smart', () => {
    render();

    expect(title()).toBe('Enviando a Smart 1…');
    expect(text()).toContain('$18.000');
    const request = sent();
    expect(request.request.body).toEqual({ terminalId: 'SMART-1', cancelPendingVale: false });
    answer(request, order());
    expect(title()).toBe('Esperando pago… 0:03');
  });

  it('after a reload it only asks: it never sends on its own', () => {
    render(false);

    expect(title()).toBe('Revisando el cobro…');
    answer(polled(), order());
    expect(title()).toContain('Esperando pago…');
    httpTesting.expectNone({ method: 'POST', url: URL });
  });

  it('after a reload before sending it, offers to send it', () => {
    render(false);
    fail(polled(), 404, { code: 'POINT_ORDER_NOT_FOUND' });

    expect(title()).toBe('No se pudo enviar a la Point');
    tap('Reintentar en la Point');
    answer(sent(), order());
    expect(title()).toContain('Esperando pago…');
  });

  it('is a labelled dialog and takes the focus', () => {
    renderWith();

    const dialog = element().querySelector('[role="dialog"]')!;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(element().querySelector('#' + dialog.getAttribute('aria-labelledby'))).toBe(
      element().querySelector('h2'),
    );
  });

  // ---- following ------------------------------------------------------------------------------

  it('asks again one second after each answer, never two at once', () => {
    renderWith();
    httpTesting.expectNone(URL);

    advance(POLL_MS);
    const first = polled();
    advance(10 * POLL_MS);
    httpTesting.expectNone(URL);

    answer(first, order());
    advance(POLL_MS);
    answer(polled(), order());
  });

  it('counts the time without timing out', () => {
    renderWith();
    advance(POLL_MS);
    polled().flush(order({ secondsSinceCreated: 600 }));
    fixture.detectChanges();

    expect(title()).toBe('Esperando pago… 10:00');
    expect(buttons()).toEqual(['Volver al carrito']);
  });

  it('after a while on the Smart, tells what to do with a similar charge', () => {
    renderWith({ secondsSinceCreated: 39 });
    expect(text()).not.toContain('cobro similar');

    next({ secondsSinceCreated: 41 });
    expect(text()).toContain('Continuar con cobro');
    expect(title()).toContain('Esperando pago…');
  });

  it('pauses while the page is hidden and asks as soon as it is back', () => {
    renderWith();
    setHidden(true);
    advance(60_000);
    httpTesting.expectNone(URL);

    setHidden(false);
    answer(polled(), order());
  });

  it('says when the Smart has not taken it, and goes on', () => {
    renderWith({ state: 'SENT', status: 'created', secondsSinceCreated: 10 });
    expect(title()).toContain('Esperando pago…');

    next({ state: 'SENT', status: 'created', secondsSinceCreated: 11 });
    expect(title()).toBe('La Point no ha recibido el cobro. ¿Está prendida y con señal?');

    next({});
    expect(title()).toContain('Esperando pago…');
  });

  it('three failures in a row say that the Point does not answer', () => {
    renderWith();
    for (let i = 0; i < 2; i++) {
      advance(POLL_MS);
      fail(polled(), 502, { code: 'POINT_UNAVAILABLE' });
    }
    expect(title()).toContain('Esperando pago…');

    advance(POLL_MS);
    fail(polled(), 502, { code: 'POINT_UNAVAILABLE' });
    expect(title()).toContain('La Point no responde');
    expect(buttons()).toEqual([
      'Reintentar',
      'La Point dice APROBADO',
      'No se cobró y la Point no muestra el monto',
      'Volver al carrito',
    ]);

    // It keeps asking, and one answer is enough.
    next({});
    expect(title()).toContain('Esperando pago…');
  });

  // ---- paid -----------------------------------------------------------------------------------

  it('paid: shows the vale until it is printed, and goes on to the next sale', () => {
    renderWith();
    next({ state: 'PAID', status: 'processed', vale: VALE });

    expect(title()).toBe('Pagado ✓');
    expect(text()).toContain('Imprimiendo vale…');
    expect(text()).toContain('Ir al inicio');

    advance(POLL_MS);
    answer(httpTesting.expectOne('/api/sales/182/vale'), { ...VALE, state: 'PRINTING' });
    expect(text()).not.toContain('Ir al inicio');

    advance(POLL_MS);
    answer(httpTesting.expectOne('/api/sales/182/vale'), { ...VALE, state: 'PRINTED' });
    expect(text()).toContain('Vale impreso ✓');
    advance(10 * POLL_MS);
    httpTesting.expectNone(URL);

    tap('Siguiente venta');
    expect(finished).toBe(1);
  });

  it('the next sale does not wait for the vale', () => {
    renderWith();
    next({ state: 'PAID', status: 'processed', vale: VALE });

    tap('Siguiente venta');
    expect(finished).toBe(1);
  });

  it('keeps asking while the vale is being sent by another question', () => {
    renderWith();
    next({ state: 'PAID', status: 'processed', vale: null });
    next({ state: 'PAID', status: 'processed', vale: VALE });

    expect(text()).toContain('Imprimiendo vale…');
  });

  it('says when it was closed by hand and is not verified yet', () => {
    renderWith({ state: 'PAID', status: 'action_required', pendingVerification: true, vale: VALE });

    expect(text()).toContain('Cerrada a mano, por verificar');
  });

  it('a payment on a voided sale is shown, never fixed', () => {
    renderWith({
      state: 'PAID',
      status: 'processed',
      saleStatus: 'VOIDED',
      paidOnVoidedSale: true,
    });

    expect(title()).toBe('Cobro recibido en una venta anulada');
    expect(returned).toEqual([]);
  });

  // ---- back to the cart -----------------------------------------------------------------------

  it('the cart does not come back until the backend says it was canceled', () => {
    renderWith();
    tap('Volver al carrito');
    expect(title()).toBe('Cancelando en la Point…');
    answer(canceled(), order({ state: 'CANCELING', cancelRequested: true }));
    expect(title()).toBe('Cancelando en la Point…');
    expect(buttons()).toEqual([]);
    expect(returned).toEqual([]);

    next({ state: 'CANCELING', cancelRequested: true });
    expect(returned).toEqual([]);

    const done = order({
      state: 'CANCELED',
      status: 'canceled',
      saleStatus: 'VOIDED',
      voidReason: 'Vuelta al carrito (no cobrada)',
    });
    advance(POLL_MS);
    answer(polled(), done);
    expect(returned).toEqual([done]);
  });

  it('paid while canceling stays paid', () => {
    renderWith();
    tap('Volver al carrito');
    answer(canceled(), order({ state: 'CANCELING', cancelRequested: true }));
    next({ state: 'PAID', status: 'processed', cancelRequested: true, vale: VALE });

    expect(title()).toBe('Ya estaba pagado ✓');
    expect(returned).toEqual([]);
  });

  it('canceled on the Smart comes back on its own', () => {
    renderWith();
    next({
      state: 'CANCELED',
      status: 'canceled',
      saleStatus: 'VOIDED',
      voidReason: 'Cancelada en la Point',
    });

    expect(returned).toHaveLength(1);
  });

  it('an expired charge asks to clear the Smart first', () => {
    renderWith();
    next({ state: 'CANCELED', status: 'expired', saleStatus: 'VOIDED' });

    expect(returned).toEqual([]);
    expect(text()).toContain('toca la flecha atrás');
    tap('Volver al carrito');
    expect(returned).toHaveLength(1);
    httpTesting.expectNone(`${URL}/cancel`);
  });

  it('without an answer it could not be canceled: it can be tried again', () => {
    renderWith();
    tap('Volver al carrito');
    fail(canceled(), 502, { code: 'POINT_UNAVAILABLE' });

    expect(title()).toBe('No se pudo cancelar');
    expect(buttons()).toEqual(['Reintentar']);
    tap('Reintentar');
    answer(canceled(), order({ state: 'CANCELED', status: 'canceled', saleStatus: 'VOIDED' }));
    expect(returned).toHaveLength(1);
  });

  it('it may be paid after failing to cancel', () => {
    renderWith();
    tap('Volver al carrito');
    fail(canceled(), 502, { code: 'POINT_UNAVAILABLE' });
    next({ state: 'PAID', status: 'processed', vale: VALE });

    expect(title()).toBe('Pagado ✓');
  });

  it('a cancel that takes too long can be asked again', () => {
    renderWith();
    tap('Volver al carrito');
    answer(canceled(), order({ state: 'CANCELING', cancelRequested: true }));
    for (let waited = 0; waited <= CANCEL_SLOW_MS; waited += POLL_MS) {
      next({ state: 'CANCELING', cancelRequested: true });
    }

    expect(title()).toBe('No se pudo cancelar');
    expect(text()).toContain('flecha atrás');
    expect(returned).toEqual([]);
  });

  it('what needs attention cannot be canceled', () => {
    renderWith();
    tap('Volver al carrito');
    fail(canceled(), 409, { code: 'POINT_CANNOT_CANCEL' });
    answer(
      polled(),
      order({ state: 'ATTENTION', status: 'action_required', cancelRequested: true }),
    );

    expect(title()).toBe('La Point necesita atención: mira su pantalla');
    expect(buttons()).not.toContain('Volver al carrito');
  });

  // ---- closing by hand ------------------------------------------------------------------------

  it('closes by hand with what the Smart shows, asking first', () => {
    renderWith({ state: 'ATTENTION', status: 'action_required' });

    tap('La Point dice APROBADO');
    httpTesting.expectNone(`${URL}/resolve`);
    tap('No');
    tap('La Point dice APROBADO');
    tap('Sí, seguro');
    const request = resolved();
    expect(request.request.body).toEqual({ outcome: 'PAID' });
    answer(
      request,
      order({ state: 'PAID', status: 'action_required', pendingVerification: true, vale: VALE }),
    );
    expect(title()).toBe('Pagado ✓');
    expect(text()).toContain('por verificar');
  });

  it('closing as not charged brings the cart back', () => {
    renderWith({ state: 'ATTENTION', status: 'action_required' });
    tap('No se cobró y la Point no muestra el monto');
    tap('Sí, seguro');
    const request = resolved();
    expect(request.request.body).toEqual({ outcome: 'NOT_PAID' });
    answer(request, order({ state: 'CANCELED', status: 'action_required', saleStatus: 'VOIDED' }));

    expect(returned).toHaveLength(1);
  });

  it('follows it again if it can still be followed', () => {
    renderWith({ state: 'ATTENTION', status: 'something_new' });
    tap('La Point dice APROBADO');
    tap('Sí, seguro');
    fail(resolved(), 409, { code: 'POINT_NOT_CLOSABLE' });
    next({});

    expect(title()).toContain('Esperando pago…');
  });

  // ---- could not be sent ----------------------------------------------------------------------

  it.each([
    ['POINT_UNAVAILABLE', 502],
    ['POINT_UNCERTAIN', 409],
  ])('a lost answer is never taken as not sent: %s', (code, status) => {
    render();
    fail(sent(), status, { code });

    expect(title()).toContain('No se sabe si el cobro llegó');
    expect(buttons()).toEqual([
      'Reintentar en la Point',
      'La Point dice APROBADO',
      'No se cobró y la Point no muestra el monto',
      'Volver al carrito',
    ]);
    tap('Reintentar en la Point');
    answer(sent(), order());
    expect(title()).toContain('Esperando pago…');
  });

  it('no connection, or no answer in 15 s, is also a lost answer', () => {
    render();
    sent().error(new ProgressEvent('error'));
    fixture.detectChanges();
    expect(title()).toContain('No se sabe si el cobro llegó');

    tap('Reintentar en la Point');
    sent();
    advance(POINT_REQUEST_TIMEOUT_MS);
    expect(title()).toContain('No se sabe si el cobro llegó');
  });

  it('a Point that is not configured offers no retry', () => {
    render();
    fail(sent(), 424, { code: 'POINT_NOT_CONFIGURED' });

    expect(title()).toBe('La Point no está configurada. Avisa al admin');
    expect(buttons()).toEqual(['Volver al carrito']);
  });

  it('a rejected charge shows why', () => {
    render();
    fail(sent(), 422, {
      code: 'POINT_ORDER_REJECTED',
      detail: 'Mercado Pago no aceptó el cobro (x).',
    });

    expect(title()).toBe('No se pudo enviar a la Point');
    expect(text()).toContain('no aceptó el cobro (x)');
    tap('Volver al carrito');
    answer(canceled(), order({ state: 'NOT_SENT', status: null, saleStatus: 'VOIDED' }));
    expect(returned).toHaveLength(1);
  });

  it('a busy Point shows whose charge it is, and can look at it or cancel it', () => {
    render();
    fail(sent(), 409, { code: 'POINT_BUSY', saleId: 181, amount: 5000 });
    expect(title()).toBe('La Point tiene un cobro pendiente');
    expect(text()).toContain('Venta #181 · $5.000');

    tap('Ver ese cobro');
    answer(
      httpTesting.expectOne('/api/sales/181/point-order'),
      order({ saleId: 181, secondsSinceCreated: 65 }),
    );
    expect(text()).toContain('Esperando ese pago… 1:05');

    tap('Cancelarlo');
    answer(
      httpTesting.expectOne('/api/sales/181/point-order/cancel'),
      order({ saleId: 181, state: 'CANCELING' }),
    );
    advance(POLL_MS);
    answer(
      httpTesting.expectOne('/api/sales/181/point-order'),
      order({ saleId: 181, state: 'CANCELED' }),
    );
    expect(text()).toContain('Ese cobro se canceló');

    tap('Reintentar en la Point');
    answer(sent(), order());
  });

  // ---- the vale of the previous one -----------------------------------------------------------

  it('waits for the previous vale, asking every 2 s', () => {
    render();
    fail(sent(), 409, { code: 'POINT_PRINTING', saleId: 181 });
    expect(title()).toBe('Esperando que termine el vale…');

    advance(WAIT_VALE_MS);
    expect(title()).toBe('Esperando que termine el vale…');
    answer(sent(), order());
    expect(title()).toContain('Esperando pago…');
  });

  it('can go back while it waits', () => {
    render();
    fail(sent(), 409, { code: 'POINT_PRINTING', saleId: 181 });
    tap('Volver al carrito');
    answer(canceled(), order({ state: 'NOT_SENT', status: null, saleStatus: 'VOIDED' }));
    advance(WAIT_VALE_MS);

    expect(returned).toHaveLength(1);
    httpTesting.expectNone(URL);
  });

  it('after 45 s the Point is busy, and only a person cancels the vale', () => {
    render();
    fail(sent(), 409, { code: 'POINT_PRINTING', saleId: 181 });
    for (let waited = 0; waited < WAIT_VALE_MAX_MS; waited += WAIT_VALE_MS) {
      advance(WAIT_VALE_MS);
      fail(sent(), 409, { code: 'POINT_PRINTING', saleId: 181 });
    }
    expect(title()).toBe('La Point está ocupada');
    expect(text()).toContain('Toca “Actualizar” en la Point; si el vale sale, reintenta');
    advance(60_000);
    httpTesting.expectNone(URL);

    tap('Cancelar vale pendiente y cobrar');
    const request = sent();
    expect(request.request.body).toEqual({ terminalId: 'SMART-1', cancelPendingVale: true });
    answer(request, order());
    expect(title()).toContain('Esperando pago…');
  });

  it('a vale coming out is waited for up to 15 s', () => {
    render();
    fail(sent(), 409, { code: 'POINT_BUSY_VALE', saleId: 181 });
    tap('Cancelar vale pendiente y cobrar');
    fail(sent(), 409, { code: 'VALE_PRINTING' });
    for (let waited = 0; waited < CLEAR_VALE_MAX_MS; waited += WAIT_VALE_MS) {
      advance(WAIT_VALE_MS);
      const request = sent();
      expect(request.request.body).toMatchObject({ cancelPendingVale: true });
      fail(request, 409, { code: 'VALE_PRINTING' });
    }

    expect(title()).toBe('La Point está ocupada');
  });

  it('a vale that cannot be canceled leaves the Point busy', () => {
    render();
    fail(sent(), 409, { code: 'POINT_BUSY_VALE', saleId: 181 });
    tap('Cancelar vale pendiente y cobrar');
    fail(sent(), 409, { code: 'VALE_STUCK' });

    expect(title()).toBe('La Point está ocupada');
    expect(buttons()).toEqual([
      'Cancelar vale pendiente y cobrar',
      'Reintentar en la Point',
      'Volver al carrito',
    ]);
  });
});
